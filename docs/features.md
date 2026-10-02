# Feature backlog

Each entry is one GitHub issue and one pull request (or one PR in a stack). Entries are small on purpose: a few files, one concern, reviewable in under 15 minutes. "Depends on" lists the entries that must be merged first. The number in front of each entry is the backlog id; the GitHub issue number is recorded next to it once the issue exists.

Every UI entry inherits the definition of done in `CLAUDE.md`: keyboard walkthrough, axe clean, both themes, 400% zoom, tests.

## Milestone 0: foundation

### F01 Scaffold the TanStack Start app (#1)
Run the TanStack CLI create command from `architecture.md` (into a temporary directory if the CLI refuses a non-empty folder, then move the result here), keep `docs/` and `CLAUDE.md`, switch to pnpm, add `typecheck`, `lint`, `test`, `test:e2e`, `db:migrate`, `db:seed` scripts. Remove the demo routes the add-ons generate.
Acceptance: `pnpm install && pnpm dev` serves an empty page at localhost:5173; `pnpm lint` and `pnpm typecheck` pass; README lists the commands.

### F02 PostgreSQL in Docker and environment validation (#2)
Add `docker-compose.yml` (PostgreSQL on 5434, named volume), `.env.example`, and a `t3env` schema for `DATABASE_URL`, `DATABASE_URL_TEST`, `OPENROUTER_API_KEY` (optional), `OPENROUTER_MODEL` (optional, default set).
Depends on: F01.
Acceptance: `docker compose up -d` starts the database; the app fails at startup with a readable message when `DATABASE_URL` is missing.

### F03 Prisma schema and first migration (#3)
Model Project (with unique `key` and `nextTaskNumber`), Status, Task, Subtask, Label, TaskLabel, Comment, Activity as in `architecture.md`. Add the Prisma client singleton in `src/server/db.ts`.
Depends on: F02.
Acceptance: `pnpm db:migrate` creates the tables; a unit test connects and counts zero projects.

### F04 Seed script with demo data (#4)
Two projects (keys TOK and DEMO), default statuses, about 30 tasks with a spread of priorities, due dates, labels, subtasks, and comments, plus activity rows.
Depends on: F03.
Acceptance: `pnpm db:seed` is idempotent (re-running does not duplicate rows).

### F05 Theme tokens with AAA contrast and a contrast check (#5)
Define light and dark theme CSS variables in `src/styles.css` (background, surface, text, muted text, border, primary, focus ring, and priority and status accents). Write `scripts/check-contrast.ts` that computes the ratio for every documented pair and fails under 7:1 for text and 3:1 for UI. Wire it into `pnpm lint`.
Depends on: F01.
Acceptance: the script passes for both themes; the pairs it checks are listed in the script.

### F06 Test harness: Vitest, Playwright, axe, CI (#6)
Vitest with a test database reset helper; Playwright with an `expectAccessible(page)` helper that runs axe with the WCAG 2.2 AAA tag set; a GitHub Actions workflow that runs lint, typecheck, unit, and e2e against a PostgreSQL service.
Depends on: F03.
Acceptance: CI is green on an empty app; the axe helper fails a page with a deliberate violation (covered by one test).

### F07 App shell: sidebar, top bar, landmarks, skip link (#7)
The `_app` layout with `nav` (projects list placeholder, Dashboard, Settings, Help), `header` (breadcrumbs placeholder, search placeholder), `main`, a skip link, and a polite `aria-live` region provided through context.
Depends on: F05, F06.
Acceptance: axe clean; Tab order starts at the skip link; landmarks are labelled.

### F08 Theme switch and motion preferences (#8)
Theme toggle (system, light, dark) persisted in `localStorage`, applied before first paint. `useReducedMotion` hook combining the OS setting and an in-app override. Motion presets in `src/lib/motion.ts` (durations, easings, fade, scale-in) that return zero-duration variants when reduced.
Depends on: F07.
Acceptance: switching theme does not flash; with the in-app override set to "reduce", the presets report zero durations (unit test).

## Milestone 1: projects and tasks

### F09 Projects service and schemas (#9)
`src/schemas/project.ts` and `src/server/projects.ts`: create (with default statuses), list, get, update, archive, restore. Activity rows for create and archive.
Depends on: F03.
Acceptance: unit tests for each function, including that create adds four statuses and that archived projects are excluded from list by default.

### F10 Projects in the sidebar and create-project dialog (#10)
Sidebar lists projects from a loader; "New project" opens a dialog with name, key (auto-suggested from the name, editable), colour; TanStack Form with Zod; errors inline and summarised.
Depends on: F07, F09.
Acceptance: creating a project focuses the new sidebar entry; the live region announces "Project X created".

### F11 Statuses service (#11)
`src/server/statuses.ts`: list for project, rename, reorder, add, delete (refusing when tasks exist in it).
Depends on: F09.
Acceptance: unit tests, including the delete refusal.

### F12 Tasks service with per-project numbering and activity (#12)
`src/schemas/task.ts` and `src/server/tasks.ts`: create (assigns `number` from `Project.nextTaskNumber` in one transaction), get, list with filters (status, priority, label, due range, text), update, move (status and order), complete, delete. Every mutation writes an Activity row.
Depends on: F11.
Acceptance: unit tests; concurrent creates in one project produce unique numbers.

### F13 Board view, read only (#13)
`projects.$projectId.board` renders statuses as columns (`h2` each) with task cards (key, title, priority icon and text, due date, label chips). Cards are links to the task route.
Depends on: F10, F12.
Acceptance: axe clean; cards are 44 px tall minimum; column order follows `Status.order`.

### F14 Create task dialog and the `c` shortcut (#14)
Dialog with title, description, status, priority, due date, labels placeholder. Opens from a button in the top bar and with `c` when focus is outside text fields. Project is pre-filled from the route.
Depends on: F13.
Acceptance: the new card appears in the right column without reload; focus lands on it; announcement made.

### F55 Create task dialog: due date input errors and specific failure messages (#76)
A partly typed due date, such as a month and day with no year, is a field error rather than no date: the form checks the input's `validity.badInput`. The due date help text names the part order and an example in the browser's locale, as the native field shows it. `createTaskFn` returns a deleted status or project as a `not_found` result, and the dialog says which one is gone. A failed create refetches the project query only.
Depends on: F14.
Acceptance: a partly typed due date shows a field error and blocks the submit, and the summary links to the field; the help text matches the format the input shows; a deleted status and a deleted project each produce their own message in the focused summary; a failed create refetches the project query only.

### F15 Move task with a "Move to" menu and keyboard (#15)
Each card has a Move menu (dropdown listing statuses, plus "Move up" and "Move down"). Optimistic update through TanStack Query.
Depends on: F13.
Acceptance: keyboard-only test moves a card between columns; live region announces "Moved TOK-12 to In progress".

### F16 Drag and drop on the board (#16)
`@dnd-kit` with pointer and keyboard sensors, drop animation through the motion presets, Escape cancels. The Move menu from F15 stays.
Depends on: F15, F08.
Acceptance: dragging with the keyboard sensor works (Space, arrows, Space); reduced motion removes the drop animation.

### F17 Task detail page (read view) (#17)
`tasks.$taskId` full page showing every field of a task, with the description rendered as Markdown. Read only. A `Markdown` component (react-markdown with remark-gfm) shows raw HTML as text, drops unsafe URLs, demotes headings below the section heading, and scrolls code blocks and tables inside their container. A `TaskDetail` component shows the reference, status, priority, due date with the Overdue word, labels, created, updated and completed times, a link to the project board, and the Description section, under an `h1` of "KEY-N Title". Editing moved to F56 and the board dialog to F57.
Depends on: F14.
Acceptance: direct navigation to `/tasks/<id>` renders every field and the description as Markdown; the title is "<task title> · <project name> · todoOverKill"; raw HTML in a description appears as text and `javascript:` links are not links; axe is clean in light and dark themes, with no horizontal scroll at 320 px and prose capped at 80 characters per line.

### F56 Edit a task on the detail page (#78)
An Edit mode in `TaskDetail` for title, description, priority, due date, and status, with the create dialog's error summary pattern. `patchTask` in the tasks service runs the move and the field update in one transaction and backs both `updateTaskFn` and the REST PATCH handler. Save updates the caches, announces "Task KEY-N saved", and refreshes the document title.
Depends on: F17, F55.
Acceptance: every field can be edited and saved with the keyboard; an empty title shows "Title is required." in a focused summary; a status from another project changes nothing; Cancel discards edits and returns focus to Edit; axe is clean on the form in both themes.

### F57 Open task detail in a dialog from the board (#79)
Board cards link to the board with `?task=<id>`, and a `TaskDialog` renders `TaskDetail` in a dialog with an "Open full page" link. The board validates the `task` search param and prefetches the open task; a missing or foreign task shows "This task was not found" without failing the board.
Depends on: F17, F56.
Acceptance: opening a task from a card shows the dialog, and Escape or Close returns focus to that card; reloading with `?task=` reopens it; Escape while editing returns to the read view; axe is clean on the open dialog in both themes.

### F18 Subtasks service (#18)
The backend for subtasks, with no UI. `src/schemas/subtask.ts` (title trimmed to 1 to 200 characters; strict create, update with title and done, and move with an index) and `src/server/subtasks.ts` (`listSubtasks` in order, `addSubtask` at the end, `updateSubtask`, `moveSubtask`, `deleteSubtask`, with NotFoundError for an unknown task or subtask). Each mutation writes one activity row on the task (`subtask.added`, `subtask.updated`, `subtask.completed`, `subtask.reopened`, `subtask.moved`, `subtask.deleted`), each with a sentence in the Activity section, and a call that changes nothing writes none. `getTask` and `listTasks` are unchanged. The checklist moved to F61 and the reorder buttons and card progress to F62.
Depends on: F17.
Acceptance: unit tests for every service function against the test database cover order after add and move, toggle, rename, delete, not-found cases, one activity row per mutation, and none for a no-op; every activity type has a sentence; `docs/architecture.md` describes the service and its activity rows.

### F61 Subtask checklist on the task page (#87)
A Subtasks section on the task page: subtasks as checkboxes with visible labels and a "2 of 5 done" line, add (Enter submits, focus returns to the input), rename, and delete, through server functions in `src/fns/subtasks.ts` wrapping the F18 service. Toggling is optimistic, rolls back with an announced error, and announces "Subtask X done" or "not done".
Depends on: F18.
Acceptance: with the keyboard alone a user can add, toggle, rename, and delete a subtask, and each change is announced and survives a reload; checkbox and button targets are at least 44 by 44 px; axe is clean on the task page with subtasks in light and dark themes, with no horizontal scroll at 320 px.

### F62 Reorder subtasks and show progress on board cards (#88)
"Move up" and "Move down" buttons per subtask row (disabled at the ends), optimistic, announcing the move, with focus staying on the moved row's button. Board cards and list rows show "2 of 5 done" as text, from a subtask count on each task in `listTasks`, not a query per card.
Depends on: F18, F61.
Acceptance: with the keyboard alone a user can move a subtask up and down, and the order is announced and survives a reload; a card for a task with subtasks shows "N of M done" and one without shows nothing; the tasks request count does not grow with the number of cards; axe is clean on the task page and the board in light and dark themes, with no horizontal scroll at 320 px.

### F19 Labels service and labelIds on tasks (#19)
The backend for labels, with no UI. `src/schemas/label.ts` (name trimmed to 1 to 50 characters, colour from `PROJECT_COLORS`, a `labelIds` array of unique ids), `src/server/labels.ts` (`listLabels` by name, `createLabel` with NotFoundError for the project and ConflictError on a duplicate name, `deleteLabel`), and `labelIds` on task create and update: create attaches them in its transaction, and update treats them as the whole new set, writes only the difference, names `labels` in the `task.updated` fields, and writes nothing for an unchanged set. A label outside the project is a NotFoundError. The REST task POST and PATCH accept `labelIds` through the shared schemas. `listLabelsFn` and `labelsQueryOptions(projectId)` let F23 and F59 read labels. The chip moved to F58, the picker to F59, and label management to F60.
Depends on: F17.
Acceptance: unit tests cover the labels service (list, create, duplicate-name conflict, delete) and task create and update with `labelIds`, including the `task.updated` row naming `labels` and the no-op case; through REST, POST with `labelIds`, PATCH `labelIds` replaces the set, a label from another project is a 404, and an unknown key is still a 400 (route tests and one e2e round trip).

### F58 Label chip and label colours on the checked palette (#81)
`CHIP_SURFACES` in `src/lib/project-colors.ts` names the theme tokens a project or label colour may be painted on, and the palette test checks every colour at 3:1 on each of them in both themes. Seed label colours move onto the palette. A `LabelChip` (text, an `aria-hidden` colour dot, and a 2 px border in the label colour on its own `--background` fill, so the border keeps 3:1 when a hovered card paints `--accent`) replaces the inline chips on the board card and the task page.
Depends on: F19.
Acceptance: the chip border reaches 3:1 on the page, card, popover, and sidebar surfaces in light and dark themes (palette test); the board card and the task page render labels through `LabelChip` and axe stays clean on both; `pnpm db:seed` stays idempotent and seeds palette colours only.

### F59 Label picker in the New task dialog and on the task page (#82)
A hand-written multi-select combobox following the WAI-ARIA APG editable combobox pattern, with selected labels as chips and 44 px "Remove <name>" buttons. It replaces the disabled Labels group in the New task dialog. On the task page it saves at once through `setTaskLabelsFn` with an optimistic update, announces "Labels of KEY-N saved", and reverts with an announced error on failure.
Depends on: F19, F58.
Acceptance: a user can pick several labels with the keyboard alone in the dialog and add or remove one on the task page, and the change is announced and survives a reload; the input and listbox carry the combobox ARIA attributes (unit test); axe is clean on the dialog and the task page with the listbox open and an option active, in light and dark themes, with no horizontal scroll at 320 px.

### F60 Project settings page with label management (#83)
`projects.$projectId.settings` with a Labels section: the labels with their colour names and a Delete button that asks for confirmation and says how many tasks lose the label, and an Add label form with a name and named colour swatches. `createLabelFn` and `deleteLabelFn` server functions, and a Settings link in the project views nav. The other project settings arrive with F29.
Depends on: F19, F58.
Acceptance: a user can add a label with a name and a named colour, and delete one after confirming, with the keyboard alone; a duplicate name shows the conflict message in the focused summary; axe is clean on the page and with the delete confirmation open, in light and dark themes, with no horizontal scroll at 320 px.

### F20 Comments service (#20)
The backend for comments, with no UI. `src/schemas/comment.ts` (body trimmed to 1 to 10000 characters; strict create and update) and `src/server/comments.ts` (`listComments` oldest first, `addComment`, `updateComment`, `deleteComment`, with NotFoundError for an unknown task or comment). Each mutation locks the task row and writes one activity row on the task (`comment.added`, `comment.updated`, `comment.deleted`) holding the task number and the comment id, never the comment's text, each with a sentence in the Activity section; an update with the same body writes none. The comment list and composer moved to F63.
Depends on: F17.
Acceptance: unit tests for every service function against the test database cover order, add, update, the no-op update, delete, not-found cases, and one activity row per mutation; every new activity type has a sentence; `docs/architecture.md` describes the service and its activity rows.

### F63 Comments on the task page (#91)
A Comments section on the task page, rendered by the task route like `ActivityLog`: comments oldest first, each body through the `Markdown` component, with relative and absolute time and "edited" when changed; a composer with a labelled textarea and an "Add comment" button that moves focus to the new comment and announces "Comment added"; Edit (a labelled textarea with Save and Cancel, focus back on Edit) and Delete (a confirmation dialog, focus to the next comment or the composer). Server functions in `src/fns/comments.ts` wrap the F20 service.
Depends on: F20.
Acceptance: with the keyboard alone a user can add, edit, and delete a comment, and each change is announced and survives a reload; posting focuses the new comment; the composer has a visible label; an empty comment shows an error in a focused summary; bodies render Markdown with raw HTML as text and unsafe links dropped, capped at 80 characters per line; controls are at least 44 by 44 px; axe is clean on the task page with comments in light and dark themes, with no horizontal scroll at 320 px.

### F21 Activity log in task detail (#21)
Renders Activity rows as readable sentences with relative and absolute times.
Depends on: F17.
Acceptance: every activity type from F12 has a sentence; time elements carry `datetime`.

### F22 List view (#22)
`projects.$projectId.list` with TanStack Table: sortable columns (key, title, status, priority, due, updated), row is a link, headers are buttons with `aria-sort`.
Depends on: F13.
Acceptance: keyboard sorting works; the table has a caption.

### F23 Filters in the URL (#23)
Filter bar on board and list: status, priority, label, due (overdue, today, this week), text. State in search params (`status`, `priority`, `label`, `due`, `q`, the REST list's names) validated with Zod; an invalid value is dropped, so the view shows every task. Filtering runs in the browser on the cached tasks with the loader's `today`, and a filter or sort change reruns no loader. Results count announced ("Showing 3 of 12 tasks"). Clear filters removes the filter params and keeps the list's sort. Switching between Board and List keeps the filters. On a filtered board, Move up and Move down use the card's place in the whole column. A card moved out of the filter leaves focus on the results line, and the new count is announced after the move.
Depends on: F22, F19.
Acceptance: reload keeps filters; clearing resets the URL; announcement made.

### F24 Dashboard: due today and overdue (#24)
Index route with a "Due today" and an "Overdue" section, read with one query across unarchived projects (`listDashboardTasks`). Overdue is due before today and not completed, the rule the board, the list and REST use. Each item is a link to its task with the reference, title, project name, priority and due date. Scope was reduced on 2026-10-02 to keep it to one PR: recent activity and per-project progress moved to F64 (#92).
Depends on: F21, F23.
Acceptance: each section has a heading and a text empty state, not just an icon; completed tasks and tasks of archived projects are left out; every item is a link at least 44 px tall; unit tests for the read against the test database; axe clean in light and dark themes and no horizontal scroll at 320 px.

### F64 Dashboard: recent activity and project progress (#92)
The rest of the dashboard, split out of F24: a "Recent activity" section with the latest activity rows across unarchived projects as sentences linking to their task, and a "Projects" section with one row per unarchived project linking to its board and showing progress as text ("7 of 21 tasks done"). One query per read, not one per project. Ships the two sections, reusing the activity sentences, relative times and loader `now` of the task page's Activity section; the activity library follow-ups from the F24 review moved to F71 (#115).
Depends on: F24.
Acceptance: each section has a heading and a text empty state; activity shows relative and absolute time; the query count does not grow with the number of projects; axe clean in light and dark themes and no horizontal scroll at 320 px.

### F25 Search service (#25)
The backend for search, with no UI. `src/schemas/search.ts` (the query trimmed to 1 to 200 characters; an optional `limit` per kind, 1 to 50, default 10; strict) and `search(query, options?)` in `src/server/search.ts`, which returns matching projects by name or key and tasks by title, description or reference. Matching ignores case and takes `%`, `_` and `\` as plain text. A query shaped like a reference (`KEY-N`, such as `tok-12`) finds that task by exact key and number, never by part of one. Archived projects and their tasks are left out; completed tasks are included. Within each kind, names or titles that start with the query (and the project whose key is the query, and the referenced task) come first, then the rest, each most recently updated first. A task result has id, number, title, project key and name, and status name; a project result has id, name, key and colour. Scope was reduced on 2026-10-02 to keep it to one PR: the command palette moved to F65 (#96) and search results in the palette to F66 (#97). REST search comes with F32; the `search` tool came with F34.
Depends on: F12.
Acceptance: unit tests against the test database cover project by name and by key, task by title, description and reference, case-insensitivity, wildcard characters taken literally, archived projects left out, the limit, the order, and invalid input (ZodError); `docs/architecture.md` describes the service.

### F65 Command palette with actions (#96)
A command palette opened with `cmd/ctrl+k` and from the Search button in the top bar: a dialog with a labelled text input and a list of actions, following the WAI-ARIA combobox with listbox pattern. Actions: New task, Go to project (one per unarchived project), Go to Dashboard, Settings and Help, and Switch theme. Typing filters the actions; a polite live region announces the number of matching options, or "No results". Escape closes it and returns focus to the opener. The shortcut works on every page, fires no browser default, and is not a single-key shortcut, so the Settings toggle does not apply. Search results come with F66.
Depends on: F14, F26.
Acceptance: with the keyboard alone a user can open the palette, filter, run each kind of action, and close it, and focus returns to the opener; the count of matching options is announced as the text changes; every option is at least 44 px tall; axe is clean with the palette open in light and dark themes, with no horizontal scroll at 320 px; `docs/architecture.md` describes the palette and the Help page lists the shortcut.

### F66 Search results in the command palette (#97)
`src/fns/search.ts` wraps the F25 service, with query options keyed by the query text. From two characters on, the palette shows matching projects and tasks below the actions in labelled groups ("Projects", "Tasks"). A task option shows its reference, title and project name and goes to the task page; a project option goes to its board. Requests are debounced and a stale response never replaces newer results. The live region announces the total number of options once results arrive, or "No results"; a failed search shows and announces an error without closing the palette.
Depends on: F25, F65.
Acceptance: typing a task title or reference lists the task and Enter opens its page, and the same works for a project name; the groups have labels screen readers read, and the announced count includes actions and results; axe is clean with results shown in light and dark themes, with no horizontal scroll at 320 px.

### F26 Settings page (#26)
Theme, motion override, single-key shortcuts on or off, "send when I stop speaking" and "read replies aloud" placeholders (disabled until F41 and F42).
Depends on: F08.
Acceptance: every control has a visible label; changes apply immediately and persist.

### F27 Help page (#27)
Glossary of product terms, keyboard shortcuts table, browser support note for voice and WebMCP.
Depends on: F07.
Acceptance: linked from the sidebar in the same position on every page; reading level checked by a human reviewer.

### F28 Delete with undo (#28)
Delete task and delete comment show a toast with Undo for 10 seconds, then commit. Toast does not auto-dismiss while focused.
Depends on: F63.
Acceptance: Undo restores the item and focus; a keyboard-only test covers it.

### F29 Project settings (#29)
Rename, key, colour, description; edit statuses (rename, reorder, add, delete with the F11 refusal); archive and restore.
Depends on: F11, F60.
Acceptance: archive asks for confirmation; restored project reappears in the sidebar.

## Milestone 2: REST API

### F30 REST: projects and statuses (#30)
Server routes under `/api/v1/projects` and `/api/v1/projects/:id/statuses` using the shared schemas and the error envelope.
Depends on: F11.
Acceptance: Vitest requests each route; validation errors return 400 with `issues`.

### F31 REST: tasks (#31)
`/api/v1/projects/:id/tasks` and `/api/v1/tasks/:id` including move via PATCH.
Depends on: F30, F12.
Acceptance: filter query params match F23; tests cover create, move, delete.

### F32 REST: subtasks, labels, comments, activity, search (#32)
Remaining routes from `architecture.md`.
Depends on: F31, F18, F19, F20, F25.
Acceptance: tests per route.

### F33 OpenAPI document and docs page (#33)
Generate OpenAPI from the Zod schemas, serve at `/api/v1/openapi.json`, render at `/api-docs` with an accessible renderer.
Depends on: F32.
Acceptance: the document validates; the page is axe clean.

## Milestone 3: tool definitions and MCP server

### F34 Tool definitions: pattern and read tools (#34)
`src/tools/definitions.ts` with TanStack AI's `toolDefinition({ name, description, inputSchema, outputSchema })` and `src/tools/server.ts` with `.server()` implementations for the read tools: `list_projects`, `get_project`, `list_tasks` (with the filters `listTasks` takes), `get_task` and `search`. Input schemas come from `src/schemas/`, are strict, so an unknown key is a validation error, and have no transforms, so they convert to JSON Schema in both of `z.toJSONSchema`'s modes; output schemas are objects, as MCP structured output needs (`list_projects` returns `{ projects }` and `list_tasks` `{ tasks }`), and describe the JSON the tools return (ISO timestamps, `YYYY-MM-DD` due dates). Each description says what the tool returns and when to use it. Each `.server()` implementation calls the service in `src/server/` and adds no logic of its own; a shared helper parses the arguments with the input schema and maps a `NotFoundError`, `ConflictError` or `ZodError` to a `ToolError` (`src/tools/errors.ts`) with a code and a readable message; any other error is logged and becomes a `ToolError` with code `internal` and a generic message. The server tools are exported as one list, `serverTools`, which F39 takes; `readServerTools` (added with F67) holds the read tools only, which the MCP server (F35) takes until F36. Scope was reduced on 2026-10-02 to keep it to one PR: the write tools for projects and tasks moved to F67 (#100), the subtask, label and comment tools to F68 (#101), and the UI tools (`navigate`, `open_task`, `set_filter`, `set_theme`) come with their client implementations in F40.
Depends on: F12, F25.
Acceptance: unit tests call each server tool against the test database, including a not-found case and an invalid-input case; `docs/architecture.md`'s tool section describes the pattern and lists which issue adds which tools.

### F67 Tools: write tools for projects and tasks (#100)
Adds `create_project`, `archive_project`, `create_task`, `update_task`, `move_task`, `complete_task` and `delete_task` to `src/tools/definitions.ts` and `src/tools/server.ts`, following the F34 pattern. Input schemas come from `src/schemas/` (including `labelIds` on `create_task` and `update_task`). `archive_project` and `delete_task` are marked `needsApproval`.
Depends on: F34.
Acceptance: unit tests call each server tool against the test database, including a not-found case and an invalid-input case; a test asserts which tools carry `needsApproval`; `docs/architecture.md`'s tool list matches the definitions.

### F68 Tools: subtasks, labels and comments (#101)
Adds the subtask tools (`list_subtasks`, `add_subtask`, `update_subtask` for title and done, `move_subtask`, `delete_subtask`), the label tools (`list_labels`, `create_label`) and the comment tools (`list_comments`, `add_comment`, `update_comment`, `delete_comment`), following the F34 pattern. `delete_subtask` and `delete_comment` are marked `needsApproval`.
Depends on: F34.
Acceptance: unit tests call each server tool against the test database; a test asserts which tools carry `needsApproval`; `docs/architecture.md`'s tool list matches the definitions.

### F35 MCP server: read tools (#35)
`/api/mcp` server route with `@modelcontextprotocol/sdk` Streamable HTTP; registers `list_projects`, `get_project`, `list_tasks`, `get_task`, `search`. `createMcpServer()` in `src/tools/mcp.ts` registers `readServerTools` from `src/tools/server.ts`, not `serverTools`, so F67's write tools stay off MCP until F36 adds confirmation. The route is stateless: a new server and transport per POST, JSON responses, no session id, and a 405 JSON-RPC error for GET and DELETE. A POST whose `Host` is not `localhost`, `127.0.0.1` or `[::1]` gets a 403, against DNS rebinding. `docs/mcp.md` covers the tools, the error results and the Claude Code setup.
Depends on: F34.
Acceptance: a Vitest test uses the SDK client to list tools and call `list_projects`; `docs/mcp.md` shows how to add the server to Claude Code.

### F36 MCP server: write tools with confirmation (#36)
Serves the write tools from F67 and F68 over MCP. `createMcpServer()` in `src/tools/mcp.ts` registers all of `serverTools`; the read tools carry `readOnlyHint: true`, the write tools `readOnlyHint: false`, and every write tool but the `create_*` and `add_*` ones `destructiveHint: true`. On MCP only, `delete_task`, `archive_project`, `delete_subtask` and `delete_comment` take an optional boolean `confirm`; without `confirm: true` they change nothing and return an `isError` result whose text starts with `confirmation_required:`, a new `ToolError` code. The shared definitions are unchanged, so the assistant keeps its own Approve and Deny prompt (F40). `docs/mcp.md` lists the write tools and the confirm rule, and the Help page's MCP entry says AI tools can read and change data and must ask before deleting or archiving.
Depends on: F35, F67, F68.
Acceptance: tests for a successful move and a refused delete.

### F37 MCP resources and prompt (#37)
`project://{id}` and `task://{id}` as Markdown; `daily_review` prompt built from the dashboard data. `createMcpServer()` in `src/tools/mcp.ts` registers both as resource templates with the MIME type `text/markdown` and no list callback, so `resources/list` stays empty and ids come from the tools. The Markdown comes from pure functions in `src/tools/resources.ts`: a project with its statuses and task counts, labels, and tasks under one heading per status; a task with its fields, description, subtasks as checkboxes and comments. Titles and names are collapsed to one line, and the headings in descriptions and comments are moved below their section. `daily_review` takes an optional `today` (`YYYY-MM-DD`, the server's day by default), reads `listDashboardTasks`, and returns one user message from `src/tools/prompts.ts` listing the tasks due today and overdue, at most 15 a section. An unknown id is a JSON-RPC `InvalidParams` error with the tools' `not_found:` text, and an unexpected error is `InternalError` with the generic `internal` message. `docs/mcp.md` covers the resources and the prompt.
Depends on: F36.
Acceptance: resource reads are tested; the prompt returns text under 2,000 characters for the seed.

## Milestone 4: AI assistant

### F38 Assistant panel with OpenRouter, text only (#38)
`/api/chat` is a POST-only server route that runs `chat()` with `createOpenRouterText(OPENROUTER_MODEL, OPENROUTER_API_KEY)` (the model defaults to `openai/gpt-4o-mini`) and streams the reply as server-sent events. It answers 403 for a `Host` that is not `localhost`, `127.0.0.1` or `[::1]` (the check `/api/mcp` uses, now in `src/lib/loopback.ts`), 415 for a body that is not `application/json`, so another site cannot spend the key, and 503 without a key. The panel is a non-modal right-hand `Sheet` beside the page, opened by the top bar's Assistant button or `a`, with an "Assistant" heading, a message list, a labelled composer and a Stop button. `useChat` lives in the always-mounted panel, so the conversation survives a close; Stop keeps the partial reply, moves focus to the Message field and announces "Reply stopped". The `_app` loader reads whether the key is set, and without it the panel explains how to turn the assistant on and shows no composer.
Depends on: F34, F26.
Acceptance: axe clean; streaming can be stopped; e2e uses a mocked SSE response.

### F69 Assistant panel hardening: history limits, request checks (#107)
`useChat` resends the whole history on every turn, so the old caps on the conversation refused every message after the 100th or after one long reply. `/api/chat` now answers 413 `payload_too_large` for a body over 1 MiB before parsing it, drops every message that is not from the user or the assistant, keeps the newest 100, and refuses a request with no user message left, all before `chat()`. On that kept history it caps each text part at 100,000 characters and only the newest user message at 20,000. The panel sends at most the newest 100 messages, so a long conversation stays under the body limit. The composer refuses a message over 20,000 characters, keeps it in the field and shows and announces "Messages can be up to 20,000 characters.". A "Clear conversation" button empties the list and announces it, and a request the server refuses says to clear the conversation. Items 4 to 7 of #107 moved to F70 (#110).
Depends on: F38.
Acceptance: a conversation of more than 100 messages, or with a reply over 20,000 characters, still accepts new messages; an over-long message shows and announces a specific error; a system message, an oversized part and an oversized body are dropped or refused, with tests.

### F70 Assistant panel behaviour: narrow-width focus, Stop focus, plain-text announcements, draft kept (#110)
Below `md` with the panel open, `c`, Ctrl+K and the command menu's actions never leave focus on the body. Stop focus is tracked on the Stop button itself, so a click on plain text does not pull focus to the composer when a reply ends. The live region carries plain text or a short status, never raw Markdown, and a reply that finished behind a modal is announced once it closes. An unsent draft survives closing the panel, and only the streaming message is re-parsed.
Depends on: F69.
Acceptance: at 320 px, e2e asserts where focus lands after `c`, Ctrl+K and a command menu action; unit tests cover the Stop focus rule; axe clean in both themes.

### F71 Activity sentences: safe field lookup, rounded relative times, one type list, live now (#115)
Follow-ups to the activity library from the F21 and F24 reviews, split out of F64, for both the task page's Activity section and the dashboard's Recent activity. The field-word lookup in `src/lib/activity.ts` uses a `Map` or `Object.hasOwn`, so a field named like an `Object.prototype` key falls back to its own name. Relative times round to the nearest unit, so a row 13 days old reads "2 weeks ago". The activity type list lives once in `src/schemas/activity.ts`, re-exported by `src/server/activity.ts`. A `useNow` hook takes the loader's `now` and refreshes it after hydration and once a minute. Paging of a long task history stays out.
Depends on: F64.
Acceptance: a field named like an `Object.prototype` key renders as its own name; a row 13 days old reads "2 weeks ago"; relative times refresh once a minute without a hydration mismatch; the type list exists in one place and the schema test checks it against the payload schemas.

### F39 Assistant data tools (#39)
Pass the server tools from `src/tools/server.ts` (the F34 read tools and whatever F67 and F68 have added) to `chat()`. Render tool calls in the message list with name, status, and result summary. The four `needsApproval` tools (`archive_project`, `delete_task`, `delete_subtask`, `delete_comment`) are left out (`assistantTools`) until F40 adds the Approve and Deny prompt, since without it such a call would pause the run with nothing to answer it.
Depends on: F38.
Acceptance: e2e with a mocked model response that calls `list_tasks` renders the tool card.

### F40 Assistant UI tools and approvals (#40)
`.client()` implementations for `navigate`, `open_task`, `set_filter`, `set_theme`; `needsApproval` tools show an Approve and Deny prompt in the panel, and `assistantTools` stops leaving them out, so the assistant can archive and delete. After navigation, focus moves to the page heading and the panel says where it went.
Depends on: F39.
Acceptance: e2e covers approve, deny, and a navigation with focus assertion.

## Milestone 5: voice and WebMCP

### F41 Speech to text: microphone toggle (#41)
`useSpeechRecognition`; microphone toggle button in the top bar (`aria-pressed`, 44 px), key binding, Escape stops; interim text renders into the assistant composer; "send when I stop speaking" setting enabled. Hidden when unsupported.
Depends on: F40.
Acceptance: e2e with a mocked `SpeechRecognition` asserts transcript, announcement "Listening", and that nothing is sent without the setting.

### F42 Text to speech: read replies aloud (#42)
`useSpeechSynthesis`; setting off by default; speaks each completed assistant message; Stop button and Escape cancel; text stays on screen.
Depends on: F38.
Acceptance: e2e with a mocked `speechSynthesis` asserts speak and cancel calls; nothing speaks on page load.

### F43 WebMCP registration (#43)
`src/tools/webmcp.ts` feature-detects `modelContext`, converts each tool's Zod input schema to JSON Schema, registers with an `AbortSignal` bound to the shell, and executes through the server functions or the client implementations. `needsApproval` tools show the same confirmation dialog.
Depends on: F40.
Acceptance: unit test of the schema conversion; e2e with a stubbed `modelContext` asserts the registered tool names and a `create_task` round trip.

### F44 WebMCP declarative forms (#44)
Add `toolname` and `tooldescription` attributes to the create-task form so the browser can drive it declaratively where supported.
Depends on: F43.
Acceptance: attributes present; form still submits normally.

## Milestone 6: polish

### F45 Reflow and zoom pass (#45)
Board becomes stacked columns under 768 px and at 400% zoom; assistant panel becomes full width; no horizontal scroll anywhere.
Depends on: F40.
Acceptance: Playwright at 320 px and at 400% zoom asserts `scrollWidth <= clientWidth` on every route.

### F46 Screen reader pass (human task) (#46)
A person walks every route with VoiceOver; fix names, roles, and announcements. Record findings in `docs/a11y-audit.md`.
Depends on: F45.
Acceptance: the audit file lists each route with "pass" or the issue opened for it.

### F47 Empty states and loading skeletons (#47)
Text-first empty states for every list and pending states with `aria-busy`.
Depends on: F24.
Acceptance: axe clean; no layout shift when data arrives (skeleton height matches).

### F48 Page titles and breadcrumbs everywhere (#48)
Every route sets `title` and breadcrumb items from loader data.
Depends on: F24.
Acceptance: e2e asserts the title on each route.

### F50 Require passing CI checks before merging to main (#56)
Add a `required_status_checks` rule to the `main` ruleset listing every CI job by name, with the up-to-date requirement. The ruleset already requires a pull request, resolved conversations, and blocks force pushes and deletion.
Depends on: F06.
Acceptance: a PR with a failing check cannot merge; `docs/architecture.md` gains a "Repository rules" paragraph.

### F49 README (#49)
Setup, commands, architecture summary with links to `docs/`, how to connect an MCP client, how to try voice and WebMCP in Chrome.
Depends on: F43.
Acceptance: a new developer can run the app from the README alone.

# Architecture

## Overview

One TanStack Start application. Several entry points call one service layer, which talks to PostgreSQL through Prisma. Tools are defined once and served over several transports.

```
Browser UI ──> routes + createServerFn ─────────────┐
REST client ──> /api/v1/* server routes ─────────────┤
MCP client ──> /api/mcp server route ────────────────┼──> src/server/* ──> Prisma ──> PostgreSQL
AI assistant ──> /api/chat (TanStack AI + OpenRouter)┤
                     └── tools from src/tools/ ───────┘
Browser agent ──> WebMCP (document.modelContext) ──> client tools ──> same server functions
Voice ──> SpeechRecognition ──> assistant panel; assistant ──> speechSynthesis
```

## Folder layout

```
src/
  routes/                   File-based routes (TanStack Router)
    __root.tsx              html document, head, devtools
    _app.tsx                Shell layout: skip link, sidebar, top bar, main, polite live region (assistant panel later); its loader fills the sidebar's project list
    _app/index.tsx          Dashboard
    _app/projects.$projectId.tsx          Project layout: h1, key, the "Project views" nav (Board, List), and the current view
    _app/projects.$projectId.index.tsx    Redirects the bare project URL to the board
    _app/projects.$projectId.board.tsx    Read-only board: one column per status, task cards linking to the task page
    _app/projects.$projectId.list.tsx     List view: the project's tasks in a sortable table (task-table), sort in the URL
    _app/projects.$projectId.settings.tsx
    _app/tasks.$taskId.tsx  Task detail page, read only until F56 adds editing and F57 the board dialog
    _app/settings.tsx
    _app/help.tsx           Help: glossary, keyboard shortcuts, browser support
    api/v1/...              REST server routes, with their Vitest files next to them
    api/v1/projects.ts      GET list, POST create
    api/v1/projects.$projectId.ts           GET, PATCH, DELETE (archive)
    api/v1/projects.$projectId.statuses.ts  GET
    api/v1/projects.$projectId.tasks.ts     GET list (filters), POST create
    api/v1/tasks.$taskId.ts                 GET, PATCH (fields and move), DELETE
    api/mcp.ts              MCP server route
    api/chat.ts             TanStack AI chat route
    api/openapi[.]json.ts
  components/
    ui/                     shadcn primitives: dialog, button, input, textarea, native-select, label, switch, table, kbd (written from the CLI's view output, edited for contrast and 44 px targets)
    app/                    Composed components: sidebar, top-bar, live-region, create-project-dialog, create-task-dialog, theme-switch, motion-switch, preference-switch, task-card, board-column, markdown, task-detail, assistant-panel, voice-button, ...
  server/
    projects.ts             Service functions: createProject, listProjects, ...; DEFAULT_STATUSES
    statuses.ts             Service functions: listStatuses, addStatus, renameStatus, reorderStatuses, deleteStatus
    tasks.ts                Service functions: createTask, getTask, listTasks, updateTask, moveTask, completeTask, deleteTask
    subtasks.ts
    labels.ts
    comments.ts
    activity.ts             ACTIVITY_TYPES, the activity type strings
    search.ts
    errors.ts               NotFoundError and ConflictError, thrown by services
    db.ts                   Prisma client singleton
    seed.ts                 Demo data for pnpm db:seed (projects TOK and DEMO)
  fns/                      createServerFn wrappers used by page routes and client tools, plus their TanStack Query options; REST handlers call src/server directly
    projects.ts             listProjectsFn, getProjectFn, createProjectFn; projectsQueryOptions, projectQueryOptions
    tasks.ts                listTasksFn, getTaskFn, createTaskFn; tasksQueryOptions (key ['projects', id, 'tasks']), taskQueryOptions (key ['tasks', id])
  tools/
    definitions.ts          toolDefinition() for every domain tool (name, description, Zod in/out)
    server.ts               .server() implementations calling src/server
    client.ts               .client() implementations for UI-only tools (navigate, open task, filter, theme)
    webmcp.ts               Registers tools on document.modelContext
    mcp.ts                  Maps definitions onto @modelcontextprotocol/sdk McpServer
  schemas/                  Zod schemas shared by forms, REST, MCP, and tools: project.ts, status.ts, task.ts
  lib/                      Utilities: dates (calendar days: today, formatting, past check, and the due filter presets; `formatDateTime` for timestamps in the local zone), priority (label, icon, and colour per priority), cn, keyboard (isEditableTarget and isSingleKeyShortcut, the checks for single-key shortcuts), motion presets, speech, project-key (key suggestion), project-colors (the project colour palette), preferences (on or off settings in localStorage), rest (the REST error envelope: handle, errorResponse, readJsonBody)
  hooks/                    useReducedMotion, useTheme, usePreference, useHotkeys, useSpeechRecognition, useSpeechSynthesis
prisma/
  schema.prisma
  migrations/
  seed.ts                   Entry for pnpm db:seed: loads .env, calls src/server/seed.ts
  test/                     Vitest and Playwright helpers: database setup and reset, callRoute (rest.ts) for REST handler tests
prisma.config.ts            Prisma CLI config: loads .env, schema and migrations paths, seed command
docs/
tests/
  e2e/                      Playwright specs and the expectAccessible helper
.github/workflows/ci.yml    Lint, typecheck, unit, and e2e on every push and pull request
```

Unit tests (`*.test.ts`, `*.test.tsx`) sit next to the file they test.

## Data model

```
Project     id, name, key (short code like "TOK", unique), description, color, nextTaskNumber, archivedAt, createdAt, updatedAt
Status      id, projectId, name, order, category (todo | in_progress | done)
Task        id, projectId, statusId, number (per project, so TOK-42), title, description,
            priority (none | low | medium | high | urgent), dueDate, order, completedAt,
            createdAt, updatedAt
Subtask     id, taskId, title, done, order
Label       id, projectId, name, color
TaskLabel   taskId, labelId
Comment     id, taskId, body, createdAt, updatedAt
Activity    id, taskId, projectId, type, payload (json), createdAt
```

Task numbers come from `Project.nextTaskNumber`, incremented inside the same transaction that creates the task. Statuses are per project so users can rename or add columns. Every new project gets Backlog, Todo, In progress, Done. `order` fields are floats to allow cheap reorders.

The activity log is append-only and written by the service layer, never directly by a route or tool. The types are listed in `ACTIVITY_TYPES` in `src/server/activity.ts`. So far: `project.created` and `project.archived` from the projects service; `task.created`, `task.updated`, `task.moved`, `task.completed`, and `task.deleted` from the tasks service; and the subtask and comment types that the seed writes. Restoring a project writes no row. A call that changes nothing, such as archiving an archived project or an empty task update, is not a mutation and writes no row either.

`prisma/schema.prisma` adds these rules to the field list. Ids are `cuid(2)` strings. `Project.key` is unique, and so are `(projectId, number)` on Task and `(projectId, name)` on Label. Deleting a Project deletes its statuses, tasks, labels, and activity. Deleting a Task deletes its subtasks, task labels, and comments. A Status that tasks still use cannot be deleted (the foreign key is `RESTRICT`), so a service that removes a status has to move its tasks first. `Activity.taskId` is nullable and set to null when the task is deleted, so the project history keeps the entry. `dueDate` is a PostgreSQL `date`: a calendar day with no time or zone. TaskLabel has `(taskId, labelId)` as its primary key and a separate index on `labelId` for filtering tasks by label.

## Service layer

`src/server/*.ts` exports plain async functions. Each takes the schema's input type (`z.input`), parses it again with the shared Zod schema from `src/schemas/`, and returns plain objects, so a caller that skips validation still gets trimmed strings and an upper-case project key. Invalid input throws a `ZodError`. The services are the only place that touches Prisma. Server functions, REST handlers, MCP tools, and AI tools are thin: parse input with the shared Zod schema, call the service, shape the response.

Services do not leak Prisma error codes. A missing record throws `NotFoundError` (`code: 'not_found'`) and a unique-rule clash, such as a taken project key, throws `ConflictError` (`code: 'conflict'`), both from `src/server/errors.ts`. The transports map these two classes, and `ZodError`, to their own error shapes. The REST handlers share one mapping, `errorResponse` in `src/lib/rest.ts`, described under REST API.

The projects service creates every project with `DEFAULT_STATUSES` (Backlog, Todo, In progress, Done) and its `project.created` row in one transaction. `listProjects` leaves archived projects out unless `includeArchived` is true. Archiving an archived project and restoring one that is not archived change nothing. The seed imports `DEFAULT_STATUSES` and `ACTIVITY_TYPES` from the services, so demo data and real data cannot drift apart.

The statuses service lists a project's statuses in board order and adds, renames, reorders, and deletes them. `addStatus` appends after the highest `order`; two adds at the same moment can store the same value, which a single-user app accepts. `reorderStatuses` takes every status id of the project in the new order and rewrites `order` as 1..n on each call, so the float `order` holds whole numbers in practice. A list that misses a status or holds one from another project throws `ConflictError`, because the client's view is stale. `deleteStatus` throws `ConflictError` while tasks still use the status, and the `RESTRICT` key backs that check up for a task created in between; the remaining statuses keep their `order` values. A project may lose its last status, and archived projects accept new statuses. Status changes write no activity rows.

The tasks service creates, reads, lists, updates, moves, completes, and deletes tasks. `createTask` takes the number from `Project.nextTaskNumber` with one atomic increment at the start of its transaction. The increment row-locks the project, so concurrent creates in one project queue there and each gets its own number under PostgreSQL's default read committed level; the transaction allows 10 seconds to start and to finish, because a burst of creates holds a pooled connection each while it waits. Numbers are never reused, not even after a delete. Without a `statusId` the task goes to the end of the project's first status; a project with no statuses throws `ConflictError`. Due dates are `YYYY-MM-DD` strings going in and coming out of the service, so the UI, REST, and tools all see one shape with no time-zone shift; inside, they are UTC midnight `Date`s in Prisma, which the `date` column stores as that day. `listTasks` returns the project's tasks in board order (status order, then status id, then task order, then number, so ties come back the same way every time) and filters by status, priority, label, due range (both ends included), completed (`false` keeps tasks with no `completedAt`, `true` only those with one), and text, which matches title or description ignoring case; only the filters given apply. Every task comes back with its `status` and a flat `labels` array.

`updateTask` changes title, description, priority, and due date; `null` clears the description or due date. `moveTask` takes a destination status, an index, or both. The index counts the destination's other tasks, so the moving task is left out of its own column; an index past the end means the end. Without an index the task goes to the end of another status, and stays where it is when the status is its current one: no `order` or `completedAt` change and no `task.moved` row, so a client that sends back a whole edit form with the unchanged status only gets the field update. The new `order` is the midpoint of its neighbours, one less than the first, or one more than the last, which costs one update. When repeated moves leave no float between two neighbours, the column is rewritten as 1..n first. `completedAt` follows the status category: a task created in or moved into a done-category status gets one (a move inside Done keeps the old value), moving to a status that is not done clears it, and a reorder within one status keeps it as it is, so a task completed in a project with no done-category status stays completed when it is reordered. `completeTask` sets `completedAt` and moves the task to the end of the project's first done-category status; a task already in one, or in a project without one, stays where it is. A task created in or moved into a done-category status gets `completedAt` but writes `task.created` or `task.moved`, not `task.completed`; only `completeTask` writes `task.completed`, so a count of completions has to read `completedAt` rather than the activity types. `deleteTask` writes `task.deleted` before the delete, and the foreign key then sets `taskId` to null on that row and the task's older rows, so the project history keeps them. When a task is deleted between the read and the write of `updateTask`, `moveTask`, or `completeTask`, Prisma's P2025 becomes the task's `NotFoundError`.

Each task mutation writes one activity row in its transaction: `task.created` with `{ number, title }`, `task.updated` with `{ number, fields }` naming the fields that changed, `task.moved` with `{ number, from, to }` status names (equal for a reorder in one column), `task.completed` with `{ number }`, and `task.deleted` with `{ number, title }`. A call that changes nothing writes no row: an update whose values equal the current ones, a move that leaves the task in place (its own position, or past the end when it is already last), and completing a completed task. Labels are only a list filter here; attaching them to tasks is F19.

## Web UI

- Routes load data with `loader` plus TanStack Query for client cache and invalidation.
- Mutations go through `createServerFn({ method: 'POST' })` wrappers in `src/fns/`, called from TanStack Query mutations with optimistic updates for local changes (checkbox, status move).
- A server function validates its input with the shared schema through `.inputValidator(schema)`. An error class thrown on the server reaches the client as a plain `Error` without its class or `code`, so an expected service error that a form shows on a field comes back as a value instead: `createProjectFn` returns `{ ok: true, project }` or `{ ok: false, code: 'conflict', message }`. Any other error is thrown, and the form shows a generic message. A `NotFoundError` in a route's server function becomes the router's `notFound()`.
- The sidebar's project list is the `projectsQueryOptions()` query (key `['projects']`). The `_app` loader fills it with `ensureQueryData`, so the list is in the server HTML, and the sidebar reads it with `useSuspenseQuery`. After a create the sidebar adds the project to that cache with `setQueryData` and refetches it in the background. There is no `router.invalidate()`: the loader would only read the same cache.
- The board (`projects.$projectId.board.tsx`) renders one `section` per status in `Status.order`, named by its `h2` (status name and task count), with a `ul` of task cards. Each card is one `Link` to `/tasks/$taskId`, at least 44 px tall, showing the task reference in an `abbr`, the title, the priority as an icon and a word, the due date in a `time` element with "Overdue" in words once the day has passed (never for a completed task), and the labels as a list of chips. Visually hidden commas separate those parts, so the link's accessible name does not run them together. A label's user-chosen colour is only an `aria-hidden` dot; text and borders use theme tokens. From `md` the columns sit in a row inside a labelled region that scrolls on its own, so the page never scrolls sideways; below `md` they stack. The region takes `tabIndex={0}` only while its content is wider than it (a `ResizeObserver` watches both), so keyboard users can scroll it then and meet no extra Tab stop otherwise. It keeps `tabIndex={0}` while it holds focus, so focus does not drop to the body if a resize or zoom ends the overflow. The scrolling region clips anything painted outside it, so the row inside has 4 px of padding: room for a card's focus outline (2 px with a 2 px offset) in the first and last columns. "Today" for the Overdue check is the local calendar day computed in the board loader and read with `Route.useLoaderData()`, so the server render and hydration agree; the app is local, so server and browser share a time zone. A board left open past midnight shows the new day's Overdue marks after its next load.
- The top bar holds a "New task" button on every project route (`CreateTaskDialog`, `src/components/app/create-task-dialog.tsx`). The top bar reads `projectId` with `useParams({ strict: false })` and the project with `useQuery` on `projectQueryOptions` with `refetchOnMount: false`, so it reads the entry the project layout's loader filled and the button is in the server HTML. It sets `retry: false` and `refetchOnWindowFocus: false`, so on a project route whose loader found no project the query fetches once, not again when the window regains focus, and the button stays hidden. The project is never asked for (3.3.7). The dialog has title, description (`Textarea`), status and priority (`NativeSelect`, a styled native `select`), due date (`input type="date"`), and a disabled Labels group until F19. Its form schema is `createTaskFormSchema`, whose empty strings `toCreateTaskInput` leaves out, so `createTaskFn` receives only the keys `createTaskSchema` knows. `createTaskFn` returns `{ ok: true, task }`, or `{ ok: false, code: 'conflict', message }` for a project without statuses; anything else is thrown, such as the `NotFoundError` of a project deleted while the dialog was open. The conflict message and the generic "Could not create the task. Try again." both show in the error summary, which takes focus, and either one invalidates `projectQueryOptions(project.id)`, so a status deleted elsewhere leaves the Status select before the next try; when the refetch drops the chosen status, the field switches to the first remaining one, so the select and the submitted value agree. A project with no statuses already holds that fallback, an empty string, and the field is left alone. While a create is in flight the dialog ignores Escape, Cancel and outside clicks, so a late result never closes a dialog the user has reopened, and the submit handler reads the live `form.state.isSubmitting` and ignores a second submit, so two quick presses create one task. The Create task button reads "Creating task…" and has `aria-disabled` rather than `disabled`, which would move focus off it to the page. After a create the dialog appends the task to the `tasksQueryOptions` cache with `setQueryData`, invalidates it in the background, and announces "Task KEY-N created". Its `onCloseAutoFocus` prevents Radix's return to the trigger and calls `focusTaskCard(task.id, trigger)` (`task-card.tsx`). That focuses the card by `taskCardId(task.id)` if the board has rendered it; otherwise focus goes to the button and a pending id waits, and `TaskCard` takes focus from the button when it mounts with that id. The handoff needs no timer. The pending id is dropped when focus leaves the button, so on a project page without a board focus stays on the button (2.4.3). Escape and Cancel leave Radix to return focus to the button.
- Single-key shortcuts go through `useHotkeys({ key: handler })` (`src/hooks/use-hotkeys.ts`), which listens for `keydown` on `window` while the `shortcuts` preference is on and looks the handler up by `event.key` in lower case, so `c` works with Caps Lock on. A keydown with no `key`, such as the one Chrome's autofill sends, is ignored, so the listener never throws. `isSingleKeyShortcut` (`src/lib/keyboard.ts`) lets a key through only with no Control, Command or Alt, when it is not repeating or composing, when focus is not in a text input, textarea, select or contenteditable, and when no `[role="dialog"]` is open, so `c` never opens a second dialog or reopens the New task dialog (2.1.4). A handled key has its default prevented, so the `c` that opens the dialog does not land in the Title field Radix focuses. `c` opens the New task dialog; it exists only where the top bar renders the dialog, so `c` does nothing on Settings or Help. The Help page's `c` row reads "Make a new task (on a project page)." and no longer carries the later note; only Ctrl+K and ⌘+K (F25) keep it.
- The bare project URL redirects to the board in `beforeLoad`. The sidebar still links to `/projects/$projectId`, and its link stays current on every project view because `Link` matches by path prefix unless `activeOptions.exact` is set.
- The list (`projects.$projectId.list.tsx`) shows the same tasks query as the board in a TanStack Table (`src/components/app/task-table.tsx`) inside the shadcn `Table`. Its columns are key, title, status, priority, due and updated; with no sort the rows keep the server's board order. The sort lives in the URL as `sort` (a column) and `dir` (`asc` or `desc`), validated by `listSearchSchema` in `src/lib/task-sort.ts` through the route's `validateSearch`. A value that fails is dropped instead of thrown, and a sort needs both params, so a stale or hand-edited URL shows board order; F23's filters will sit beside them. A header press steps through ascending, descending and cleared, and writes the next step with `replace: true` and `resetScroll: false`, so a reload keeps the sort and Back leaves the list rather than stepping through sorts. The live region announces "Sorted by Priority, ascending" or "Sorting cleared". Each `th` has `scope="col"` and holds a 44 px button naming the column with an `aria-hidden` arrow; only the sorted `th` has `aria-sort`. The key sorts by task number (TOK-2 before TOK-10), status by `Status.order`, priority from none to urgent, and a task with no due date sorts last in both directions. Each row is one `Link`, in the title cell, whose `::after` covers the row (the `tr` is `relative`), so a click anywhere in the row except the Key `abbr` (lifted above the overlay so its `title` stays reachable) opens the task and the keyboard meets one Tab stop per row, named by the title. The caption names the project and the task count. The table keeps its columns at 320 px: its cells wrap, and a table still too wide scrolls inside its container, a region labelled "Task table" that takes `tabIndex={0}` while it overflows, through the board's `useOverflowsX` hook (`src/hooks/use-overflows-x.ts`). The container is `relative`, so the row overlays never reach past the table or widen the page.
- Forms use TanStack Form with the shared Zod schema as the form-level `onSubmit` validator. The `form` has `noValidate` so the browser never shows its own bubbles, and required inputs have `aria-required` and say "(required)" in the label. Each error shows under its field, linked with `aria-describedby` and `aria-invalid`, and in a summary at the top of the form: a `tabIndex={-1}` container with a heading and a link to each field, which takes focus after a failed submit, so it is read once without `role="alert"`. Fields have no blur validation: a blur would clear the submit error of a field that is still invalid.
- The shadcn components in `src/components/ui/` were written by hand from `shadcn view` output rather than installed, because the current registry imports `cn` from a separate `cn` package; they import `cn` from `#/lib/utils`. They are edited to the contrast rules in `src/styles.css` (no opacity on theme colours, token pairs instead of `text-white`), every size is at least 44 px, and the focus ring comes from the global `:focus-visible` rule. `Table` cells wrap rather than staying on one line, so a narrow table reflows at 320 px; its container still scrolls a table too wide to wrap, and a table that can overflow passes `tabIndex`, `role` and `aria-label` to that container through `containerProps`, so the keyboard can scroll it. `Kbd` draws a key cap in foreground text on muted with a minimum size rather than a fixed height.
- URL holds view state that should survive reload: active project, view (board or list), filters, open task. Search params are validated with Zod through the route's `validateSearch`.
- Task detail is a full page at `/tasks/$taskId` (`tasks.$taskId.tsx`). F57 adds a dialog on the board (search param `task=`) that renders the same `TaskDetail`; until then board cards link to the page.
- The task page's loader fills the task and project queries and returns `today`, the local calendar day, for the Overdue word, as the board loader does. The document title is "<task title> · <project name> · todoOverKill", and the `h1` is "KEY-N Title". `TaskDetail` (`src/components/app/task-detail.tsx`) is read only: a `dl` with the reference in an `abbr`, a link to the project board (at least 44 px tall), status, priority as an icon and a word, due date in a `time` element with "Overdue" once the day has passed (never for a completed task), labels as chips whose colour is only an `aria-hidden` dot, and Created, Updated and (when set) Completed as `time` elements with `formatDateTime`. `formatDateTime` uses the local zone of whichever side renders, so the server render and hydration show the same time only because the app is local and server and browser share a zone; a server in another zone (such as `TZ=UTC` in a container) would make Created and Updated differ at hydration. Below it a Description `section`, labelled by its heading, holds the Markdown or "No description". The `dl` stacks below `sm` and is two columns from `sm`.
- Task descriptions render through `Markdown` (`src/components/app/markdown.tsx`): react-markdown with remark-gfm (tables, strikethrough, task lists) and no rehype-raw, so raw HTML in the source is shown as text. react-markdown's default `urlTransform` keeps relative URLs and the `http`, `https`, `irc`, `ircs`, `mailto` and `xmpp` schemes and empties every other one (`javascript:`, but also `tel:` or `ftp:`), and the component renders a link without an href as plain text. Headings start one level below the heading of the section the Markdown sits in; HTML has no level past h6, so under the h2 Description `####`, `#####` and `######` all render as h6 and a deeper outline loses levels. The visually hidden Footnotes heading remark-gfm adds sits directly below the section heading. A task list item's state is text ("[x]" with a visually hidden "done") rather than a disabled checkbox. Code blocks and tables scroll sideways inside their own container, which uses `useOverflowsX` (`src/hooks/use-overflows-x.ts`) and, only while it overflows or holds focus, is a region labelled "Code block" or "Table" and a Tab stop, so short snippets add no landmarks or Tab stops. For 1.4.8 the wrapper is `max-w-prose` (65ch, under 80 characters per line) with `leading-relaxed` (1.625, kept on the smaller code text), and blocks, loose list items and paragraphs in a quote sit 40 px apart (`gap-10`, as on the Help page), over 1.5 times the line height.
- The shell's `LiveRegionProvider` renders the app's one polite `aria-live` region. Components announce status changes with `useAnnounce()` from `src/components/app/live-region.tsx` and do not add their own live regions (4.1.3).
- Each route under `_app` sets `staticData: { title }`, typed by a `StaticDataRouteOption` augmentation in `src/routes/_app.tsx`. The shell reads the deepest match's title with `useMatches()` and shows it as the breadcrumb's current item. F48 replaces this with full breadcrumbs built from loader data.
- Theme is a `dark` class on `html`, with both themes defined as CSS variables in `src/styles.css`. The motion override is a `data-motion` attribute on `html` (`reduce` or `allow`, absent for "follow system"); CSS uses it, together with `prefers-reduced-motion`, to collapse transitions and animations. Both settings live in `localStorage` (`todoOverKill.theme`: `system`, `light` or `dark`; `todoOverKill.motion`: `system`, `reduce` or `allow`). A blocking inline script (`THEME_INIT_SCRIPT` in `src/lib/theme.ts`) in the root document's `head` applies both before `body` is parsed, so the first paint already has the right theme.
- `useTheme()` (`src/hooks/use-theme.ts`) and `useMotionSetting()`, `useReducedMotion()` and `useMotionPresets()` (`src/hooks/use-reduced-motion.ts`) read module-level stores through `useSyncExternalStore`. The stores listen for `storage` events from other tabs and `change` on the OS media queries. Hydration renders the server snapshot (`system`) first, so the class and attribute are never written from a rendered value: the stores write them from live values when something changes and once on mount, and the writes do nothing when the DOM already matches. That way hydration cannot undo what the head script set.
- `PreferencesProvider` (`src/components/app/preferences.tsx`) is always mounted in the app shell. It keeps the stores subscribed on every route and wraps the app in Motion's `MotionConfig` with `reducedMotion` set from `useReducedMotion()`. Motion components take their transitions and variants from `src/lib/motion.ts` (`durations`, `easings`, `fade`, `scaleIn`), which return zero durations and no transform when motion is reduced.
- The on or off settings live in `localStorage` as `on` or `off`: `todoOverKill.shortcuts` (single-key shortcuts, default `on`), `todoOverKill.voice.sendOnPause` ("send when I stop speaking", default `off`) and `todoOverKill.voice.readAloud` ("read replies aloud", default `off`). `src/lib/preferences.ts` holds the keys, defaults and Zod schema; `usePreference(name)` (`src/hooks/use-preference.ts`) reads one through `useSyncExternalStore`, listens for `storage` events from other tabs, and renders the default as the server snapshot, so the stored value appears just after hydration. F14's hotkey hook reads `todoOverKill.shortcuts`; F41 and F42 read the voice settings.
- The Settings page has three sections. Appearance holds the theme and motion radio groups (F08). Keyboard holds the single-key shortcuts switch. Voice holds the "send when I stop speaking" and "read replies aloud" switches, shown disabled with a "Not available yet" note until F41 and F42 enable them. Each switch is a `PreferenceSwitch` (`src/components/app/preference-switch.tsx`): a visible label, a description and, when disabled, the note, both linked by `aria-describedby`, with the change announced through `useAnnounce()`.
- The Help page (`src/routes/_app/help.tsx`) is static. It has three sections, Glossary, Keyboard shortcuts and Browser support, each a labelled `section` with an id (`glossary`, `shortcuts`, `browsers`) that a contents list at the top links to. The contents links are plain `href="#id"` anchors, like the skip link: the browser scrolls to the section and focuses it (`tabIndex={-1}`), so the next Tab continues from it, and no script runs on a click that opens a new tab. Each glossary term's `dt` has an id with a `term-` prefix, such as `term-backlog` or `term-webmcp`, so other pages can link a term to its definition (3.1.3) without clashing with ids in the app shell. Terms for features that have not shipped (Board, Assistant, Voice, MCP, WebMCP) carry a "Not available yet. Arrives in a later release." note. The REST API entry says which endpoints exist today (F30's projects and statuses, F31's tasks) and that subtasks, labels, comments and search come later. The shortcuts table draws every key as a `Kbd` and shows how a row's keys are pressed: a chord is a `KbdGroup` with `+` between the caps (Shift+Tab), a sequence is joined by "then" (Tab then Enter), and a choice by "or" (the arrow keys). Glyph keys (the arrows and ⌘) and Ctrl show the glyph with `aria-hidden` and a visually hidden name, such as "Up arrow" or "Control". It lists the keys that work today, and `c` (F14) and Ctrl+K and ⌘+K (F25) with the same later note, which those features remove when they land. The assistant panel's shortcut is left out until F38 picks a key. Browser support says voice and WebMCP work only in Chrome, that other browsers hide their controls, and that Chrome's speech recognition may send audio to Google while the app sends only text to OpenRouter.
- Drag and drop with `@dnd-kit`, keyboard sensors enabled, and a visible "Move to" menu on every card as the non-drag path.

## REST API

Base path `/api/v1`, implemented as TanStack Start server routes (`createFileRoute` with `server.handlers`). JSON in and out. No auth. Errors return `{ error: { code, message, issues? } }`.

A handler parses the query or body with the shared Zod schema, calls the service, and returns `Response.json`. Its body runs inside `handle()` from `src/lib/rest.ts`, which turns a thrown error into the envelope:

| Thrown                                                               | Status | `code`                                                                  |
| -------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `ZodError`                                                           | 400    | `validation`, with the Zod `issues` (each has a `path` and a `message`) |
| Body that is not JSON (`readJsonBody`)                               | 400    | `invalid_json`                                                          |
| Body whose `Content-Type` is not `application/json` (`readJsonBody`) | 415    | `unsupported_media_type`                                                |
| `NotFoundError`                                                      | 404    | `not_found`                                                             |
| `ConflictError`                                                      | 409    | `conflict`                                                              |
| anything else                                                        | 500    | `internal`; the error is logged and its message is not sent             |

POST and PATCH must send `Content-Type: application/json` (a `charset` parameter is fine). Without it, a page on another site could post a `text/plain` body with `mode: 'no-cors'`, which the browser sends without a CORS preflight. Requiring JSON forces the preflight, which fails because the API sends no CORS headers.

A success returns the bare resource or array, not a wrapper. Create returns 201, everything else 200. `GET /projects` leaves archived projects out unless the query has `includeArchived=true` (`listProjectsQuerySchema`, a `z.stringbool()` that also reads `1`/`0` and `yes`/`no`; any other value is a 400). `DELETE /projects/:id` archives and returns the archived project; a second DELETE returns it unchanged. Start runs only the handlers of the deepest matching route, so `/projects/:id` does not inherit the GET and POST of `/projects`. Status writes, restoring a project, and completing a task as its own call are not on REST yet.

`GET /projects/:id/tasks` takes F23's filter names (`listTasksQuerySchema`): `status`, `priority`, `label`, `due` and `q`. A query parameter given twice keeps its last value, because the handler reads the query with `Object.fromEntries`. An empty value means the filter is absent for all five names, because an HTML GET form or the filter bar sends `?priority=` for a filter nobody picked; a value the filter does not accept, such as `due=soon`, is a 400. The query schema is strict: an unknown parameter, such as `statusId`, `completed` or `dueFrom`, is a 400 rather than an unfiltered list. `dueFilterRange` in `src/lib/dates.ts` turns `due` into the service's range, counted from today, the server's local calendar day (the app is local, so it shares the browser's zone): `today` is that day, `week` is today and the six days after it, and `overdue` is due before today and not completed (`completed: false`). Overdue means that on every surface, the board card's Overdue mark and the API alike, so a task due yesterday in a done status is not overdue.

`PATCH /tasks/:id` takes the update fields and the move fields (`statusId`, `index`) in one body (`patchTaskSchema`), parsed once, so any invalid field is a 400 before anything is written. The task schemas, `patchTaskSchema` and `createTaskSchema`, are strict: an unknown key is a 400 with an `unrecognized_keys` issue, so `{ "status": "…" }` (the list filter's name, not the field's) cannot return 200 with nothing changed. The handler calls `moveTask` first when the body has `statusId` or `index`, then `updateTask` when it has a field, and returns the last result; an empty body returns the task unchanged. The move goes first because it is the only call that can fail on the caller's input (a status outside the project is a 404), so a rejected move changes nothing and writes no activity. The two writes are separate transactions: a task deleted between them gets the move but not the update, and the client sees 404. `DELETE /tasks/:id` deletes the task for real and returns it; its activity rows, the `task.deleted` row included, stay in the project history, and a second DELETE is a 404.

```
GET    /projects                 list; ?includeArchived=true
POST   /projects                 create
GET    /projects/:id             with statuses
PATCH  /projects/:id
DELETE /projects/:id             archive (soft)
GET    /projects/:id/statuses    board order
GET    /projects/:id/tasks       filters: status, priority, label, due (overdue|today|week), q
POST   /projects/:id/tasks
GET    /tasks/:id                with status and labels
PATCH  /tasks/:id                fields, statusId, index (move)
DELETE /tasks/:id                deletes for real
POST   /tasks/:id/subtasks
PATCH  /subtasks/:id
DELETE /subtasks/:id
GET    /tasks/:id/comments
POST   /tasks/:id/comments
GET    /tasks/:id/activity
GET    /labels?projectId=
POST   /labels
GET    /search?q=
GET    /openapi.json
```

The OpenAPI document is generated from the Zod schemas and served at `/api/v1/openapi.json`, with a rendered page at `/api-docs`.

## Tools: one definition, four consumers

`src/tools/definitions.ts` declares every tool with TanStack AI's `toolDefinition({ name, description, inputSchema, outputSchema, needsApproval })`. The Zod schemas come from `src/schemas/`.

```
list_projects, get_project, create_project, archive_project
list_tasks (filters), get_task, create_task, update_task, move_task, complete_task, delete_task
add_subtask, toggle_subtask
add_comment
search
navigate, open_task, set_filter, set_theme        (client only)
```

Consumers:

1. AI assistant. `/api/chat` calls `chat({ adapter: openRouterText(model), messages, tools })` and streams with `toServerSentEventsResponse`. Data tools use `.server()` implementations. UI tools are passed as definitions and executed in the browser through `useChat({ tools })` with `.client()` implementations.
2. MCP server. `src/tools/mcp.ts` registers each server tool on an `McpServer` from `@modelcontextprotocol/sdk` and serves it over Streamable HTTP at `/api/mcp`. It also exposes resources `project://{id}` and `task://{id}` as Markdown, and a `daily_review` prompt.
3. WebMCP. `src/tools/webmcp.ts` runs on the client, feature-detects `modelContext`, and calls `registerTool` for every tool with a JSON Schema derived from the Zod input schema. Data tools execute by calling the server functions; UI tools call the same client implementations as the assistant. Registration uses an `AbortSignal` tied to the shell's lifetime.
4. REST. Not tool-based, but the handlers use the same Zod schemas.

Tools marked `needsApproval` (delete, archive) surface a confirmation in the assistant panel before executing. The MCP and WebMCP paths return an error asking for `confirm: true` on those tools, and the UI shows the same confirmation dialog when WebMCP triggers them.

## Assistant, voice, and speech

- The assistant panel is a shadcn `Sheet` on the right, toggled from the top bar and with a shortcut. It renders `useChat` messages, tool calls with their status, and approval prompts.
- `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` come from the environment. Missing key: the panel shows an explanation and the voice button is hidden.
- Speech to text: `useSpeechRecognition` wraps `webkitSpeechRecognition` / `SpeechRecognition`. Toggle button in the top bar (`aria-pressed`), also bound to a key; Escape stops listening. Interim results render into the composer; the user sends explicitly or turns on "send when I stop speaking" in Settings.
- Text to speech: `useSpeechSynthesis` wraps `speechSynthesis`. "Read replies aloud" is a setting, off by default. A Stop button and the Escape key cancel speech. The text is always on screen.
- Both hooks return `supported: false` outside Chrome and the related controls do not render.

## Testing

- Vitest runs two projects from `vitest.config.ts`. The `server` project covers test files under `src/server/`, `src/fns/`, `src/tools/`, and `src/routes/api/`. It runs in Node against the real test database (`DATABASE_URL_TEST`), one file at a time, and `src/test/setup-server.ts` empties every table with `resetDatabase` from `src/test/db.ts` before each file. The `client` project runs every other test file in jsdom, in parallel. A file in the client project that imports server code still needs the `// @vitest-environment node` docblock.
- Playwright for user flows. Every spec that opens a page or dialog calls `expectAccessible(page)` from `tests/e2e/accessibility.ts`. It runs `@axe-core/playwright` with the tags `wcag2a`, `wcag2aa`, `wcag2aaa`, `wcag21a`, `wcag21aa`, and `wcag22aa` and fails with a list of every violating element. axe has no `wcag22aaa` tag. `tests/e2e/accessibility.spec.ts` checks that the helper fails a page with a missing `alt`.
- `playwright.config.ts` builds the app and serves it with `vite preview` on port 3100, with `DATABASE_URL` set to `DATABASE_URL_TEST`, so e2e runs never touch the app database. It runs Chromium only, because voice and WebMCP exist only in Chrome. Playwright starts the web server before its global setup. That is safe because the app opens its Prisma connection on the first query. The global setup in `tests/e2e/global-setup.ts` then migrates the test database and empties it, once per run. Specs that write data clean up after themselves or use names no other spec uses.
- REST routes are tested in Vitest by calling the route's handler with a `Request` through `callRoute` in `src/test/rest.ts`, because Start's fetch handler needs the Vite plugin's virtual modules and does not boot under Vitest. `tests/e2e/api.spec.ts` sends real requests to the preview server, which covers what the handler tests cannot: that each route is in the route tree and not shadowed by its parent. The route generator leaves `src/routes/api/v1/projects.test.ts` and `tasks.test.ts` out of the route tree because they export no `Route`, and logs a warning for each.
- A keyboard-only smoke test walks the main flows with Tab, Enter, Space, arrows, and Escape only.
- Speech APIs are mocked in Playwright with `page.addInitScript`; tests assert the transcript flow, not recognition quality.
- Contrast is checked in CI by a script that reads the theme CSS variables and computes ratios for every foreground and background pair.
- The MCP endpoint is tested with the SDK's client over HTTP in Vitest.

## Repository rules

The `main` branch has a GitHub ruleset. Changes reach `main` only through a pull request, every review conversation must be resolved, the CI job "Lint, typecheck, unit, and e2e" must pass on a branch that is up to date with `main`, and force pushes and deletion are blocked. No approvals are required. The rules apply to people and agents alike, so a merge step that waits is waiting on a red check, an unresolved comment, or a branch that needs a rebase.

## Local infrastructure

`docker-compose.yml` starts PostgreSQL on port 5434, bound to 127.0.0.1 only (5432 and 5433 are already in use on the development machine). `.env.example` documents `DATABASE_URL`, `DATABASE_URL_TEST`, `OPENROUTER_API_KEY`, and `OPENROUTER_MODEL`. Environment variables are validated with `t3env`.

The compose file mounts `docker/init-test-db.sql`, which creates the `todo_over_kill_test` database for `DATABASE_URL_TEST` the first time the volume is initialised. On an older volume the database has to be created by hand; the README gives the command. The schema in `src/env.ts` reads `process.env`, because server variables have no `VITE_` prefix and never reach `import.meta.env`. It validates the raw strings and passes them through unchanged, so `env` and `process.env` (which Prisma reads) hold the same values. t3-env treats the module as client code whenever `window` exists and blocks server variables there, so unit tests of server code need the `// @vitest-environment node` docblock.

The config function in `vite.config.ts` loads `.env` into `process.env` with `src/lib/load-dot-env.ts` before any plugin hook runs. Variables already set in the shell take precedence. The loader drops the keys it loaded before, so a key deleted from `.env` does not survive a dev server restart. TanStack Start's load-env plugin copies `.env` again later, which changes nothing because every key already holds the value it would write. For the dev and preview servers the config function then imports the schema, so a missing or invalid variable stops startup with a readable message. When a restart after a `.env` edit fails validation, `process.env` goes back to its previous values, Vite logs the message and "server restart failed", and the old server keeps running with its old environment. `vite build` does not evaluate the schema and runs without a `.env`.

`src/server.ts`, the custom server entry, imports the schema first, so `dist/server/server.js` fails when it loads rather than on the first request. It does not read `.env`: outside `pnpm preview` the variables come from the real environment, for example `node --env-file=.env`.

`prisma.config.ts` loads `.env` with the same loader, so shell variables win there too. It passes `DATABASE_URL` to Prisma only when the variable is set. Without it `prisma generate` still runs, which is why `postinstall` can call it on a fresh clone, and the commands that need a database fail with Prisma's own message. Prisma's `env()` helper is not used because it throws while the config loads. The generated client goes to the gitignored `src/generated/prisma`. Since Prisma 7, `prisma migrate dev` does not regenerate it, so `pnpm db:generate` has to run after every schema change. `src/server/db.ts` builds the client on `@prisma/adapter-pg` and connects to `DATABASE_URL_TEST` when `NODE_ENV` is `test` (Vitest sets it) and to `DATABASE_URL` otherwise. Outside production the client is kept on `globalThis`, so dev server reloads reuse one connection pool.

`pnpm db:seed` runs `prisma db seed`, which runs the `migrations.seed` command from `prisma.config.ts`: `tsx prisma/seed.ts`. Plain Node cannot run it, because the seed imports `#/server/db`, which imports `#/env` and the generated client without file extensions, and Node adds none when it resolves subpath imports. `prisma/seed.ts` loads `.env` before importing anything that validates it, then calls `seed()` from `src/server/seed.ts`. The seed owns the projects with keys TOK and DEMO. In one transaction it deletes their tasks, then the projects (deleting a project first could reach a status while tasks still point at it, which the `RESTRICT` key refuses), and creates both again with statuses, labels, about 30 tasks, subtasks, comments, and activity. Re-running it leaves the same data, and other projects are not touched. The transaction has a 60 second timeout instead of Prisma's 5 second default. `seed()` takes a `now` option for the dates, and accepts a transaction client as well as a `PrismaClient`.

`vitest.config.ts` and `playwright.config.ts` load `.env` the same way. The Vitest config runs in the main process before the global setup and before the worker processes start, and the workers inherit `process.env`, so `src/env.ts` validates in every test file without stubbing. Both global setups call `prepareTestDatabase` in `src/test/prepare-test-database.ts`, which runs `prisma migrate deploy` with `DATABASE_URL` set to `DATABASE_URL_TEST`. If nothing accepts a connection on that URL's host and port and the host is local, the setup first runs `docker compose up --detach --wait db` and stops the container when the run ends, so a test run leaves Docker as it found it. It stops with a message when `DATABASE_URL_TEST` is missing or the database cannot be started. The Playwright config also stops at load when `DATABASE_URL_TEST` is missing, before it builds anything.

The CI workflow in `.github/workflows/ci.yml` runs one job with a PostgreSQL 17 service. It sets `DATABASE_URL` and `DATABASE_URL_TEST` to the same `todo_over_kill_test` database, then runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e`, and uploads the Playwright report.

## Scaffold

The app is created with the TanStack CLI so the add-ons are wired the way the framework expects:

```bash
npx @tanstack/cli@latest create app --framework react --toolchain eslint --add-ons shadcn,prisma,tanstack-query,form,table,t3env,ai,mcp --package-manager pnpm --no-git --target-dir "$TMP/app" -y
```

The CLI refuses a non-empty folder unless given `--force`, which overwrites files, so F01 generated the app in a temporary directory and copied it into the repository. F01 then removed the demo routes, components, and data that the add-ons generate, including the demo chat and MCP routes from the `ai` and `mcp` add-ons. F35 (`/api/mcp`) and F38 (the assistant chat route) write those routes against `src/tools/`.

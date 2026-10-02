# How we work

This page describes how work is planned, designed, built and reviewed. It applies to people and to agents (handoff runs, Claude Code sessions) alike.

## Where things live

| What                                               | Where                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Product, architecture, accessibility contract      | `docs/project.md`, `docs/architecture.md`, `docs/accessibility.md`                                                             |
| Backlog in text form                               | `docs/features.md`                                                                                                             |
| The plan (epics, stories, tasks, status, blockers) | GitHub Project "todooverkill plan" (https://github.com/users/Krister-Johansson/projects/5)                                     |
| Scope and acceptance criteria of one piece of work | The GitHub issue. It is the source of truth.                                                                                   |
| Visual design                                      | Claude Design project "todoOverKill: refined product design" (https://claude.ai/design/p/6030b21d-a242-48b1-b104-39cc6d92af81) |
| Screenshots of the design                          | The `design-assets` branch, folder `design/v2/`                                                                                |
| Agent runs                                         | handoff, project `todooverkill`                                                                                                |

## The plan

The plan has three levels. Each level is a GitHub issue with a label, and each lower level is a sub-issue of the one above.

- An **epic** (label `epic`) is an outcome, such as "Refined product redesign". Its body states the goal, the acceptance criteria and the stories under it.
- A **story** (label `story`) is a user-visible slice of an epic. Its body lists acceptance criteria and its tasks.
- A **task** (label `task`) is one pull request. Its body is the brief an agent reads: the goal, where in the code, how to tell it is done, acceptance criteria, who it is for, blockers and the design section.

Every epic, story and task has acceptance criteria as checkboxes. A task is done when its criteria and the definition of done in `CLAUDE.md` are met.

### Who the work is for

Every epic, story and task has a "Who it is for" section. It names one primary persona, any others the work serves, and what they get from it. Build and review the work from that persona's side. The personas come from `docs/project.md` and `docs/accessibility.md`:

| Persona               | Who it is                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Solo planner          | The primary user: one person managing their own work across a few projects.                  |
| Keyboard user         | A person who does everything without a pointer.                                              |
| Screen reader user    | A person who uses VoiceOver and depends on names, roles and announcements.                   |
| Low-vision user       | A person who uses 400% zoom, a 320 px wide window or the dark theme, and needs the contrast.  |
| Motion-sensitive user | A person who has Reduce motion on, in the OS or in the app.                                  |
| Voice user            | A person who speaks to the assistant and listens to its replies in Chrome.                   |
| MCP client            | An agent such as Claude Code connected to `/api/mcp`.                                        |
| Browser agent         | An agent that finds and calls the page's WebMCP tools.                                       |
| API developer         | A person or script that calls `/api/v1` or reads the API docs.                               |
| Maintainer            | A person or agent who builds and reviews the code.                                           |
| Evaluator             | A person who checks the AAA claim or tries the demo from the README.                         |

### Statuses

The Status field on the GitHub Project moves through:

1. **Shaping**: the issue is written but not agreed. Nobody starts it.
2. **Ready**: agreed and unblocked. handoff picks tasks from here.
3. **Running**: a run or a person is working on it.
4. **In review**: a pull request is open.
5. **Done**: merged and closed.

Move a task to Ready only when its blockers are closed or about to close, and its design file exists if it touches UI.

### Blockers

Order between issues is recorded as GitHub "blocked by" relationships, and repeated as a **Blocked by** line in the task body. Do not start a task while any issue it is blocked by is open.

The main chains are:

- Redesign: R1 tokens (#141), then R2 type and shape (#142), then R3 shell (#143), then the screen restyles (#144 to #151).
- Every UI feature waits for the restyle of the screen it changes, so new UI is built in the new style. For example, drag and drop (#16) waits for the board restyle (#145).
- Feature order from `docs/features.md`, such as F40 (#40) before voice (#41) and WebMCP (#43).

## The design

The Claude Design project holds one `.dc.html` file per screen or state: Foundations, Dashboard, Board, Board drag, Board task dialog, List view, Task detail, Task edit, New task dialog, Project settings, Confirm dialogs, Command palette, Assistant panel, Settings, Help, API docs, Feedback states and Mobile 320. `tok.css` in the same project holds the tokens and components that every file uses.

Each file has:

- a `theme` property (light or dark) that you can switch in Claude Design;
- a "Build notes" box at the bottom. The notes are part of the spec: keyboard behaviour, ARIA, announcements and the issues the screen belongs to.

To read a design file:

- open the link in the issue's Design section; or
- with the claude-design MCP, call `read_file` with project id `6030b21d-a242-48b1-b104-39cc6d92af81` and the file name, for example `Board.dc.html`.

The design follows `docs/accessibility.md`. Every colour pair in `design/v2/tokens.css` passes `scripts/check-contrast.ts`, and `--border-subtle` is decorative only: it is never the only visible boundary of a control. When the design and `docs/accessibility.md` disagree, the accessibility contract wins and the design is fixed.

The first draft, "industrial utility" (Claude Design project `ec1de6ba-9414-4da3-ae56-f275aec25123`, top-level PNGs on `design-assets`), is kept for history only. Do not build from it.

### Changing the design

1. Check any new or changed colour against `scripts/check-contrast.ts` before it goes into a design file.
2. Edit the file in Claude Design. For a large change, copy the file and keep the old one.
3. Render the changed files at 1440 px in light and dark and commit the PNGs to `design-assets` under `design/v2/` with the file's slug, for example `board-light.png` and `board-dark.png`.
4. If a change alters scope, update the acceptance criteria of the affected issues.

## Building a task

1. Read the issue, including the Blocked by line and the Design section. Check that every blocker is closed.
2. Read `CLAUDE.md` and the parts of `docs/` the task touches.
3. If the task changes UI, open its design file and read the build notes before writing code.
4. Branch `<issue-number>-<short-slug>` from `main`.
5. Build the smallest change that meets the acceptance criteria. Match the surrounding code.
6. Meet the definition of done in `CLAUDE.md`, and for UI compare the result with the design in both themes.
7. Open a pull request whose body ends with `Closes #N`. Keep `docs/` true in the same pull request.

## Adding work

Add work through handoff so it lands in the plan with the right labels and parent:

- `create_epic` with a title and goal, then add acceptance criteria to its body;
- `create_story` under an epic, with acceptance criteria;
- `create_task` under a story, with a brief, acceptance criteria and `blocked_by`;
- `plan_issue` to bring an existing open issue under a story.

Keep each task to one reviewable pull request: a few files, one concern. If a task grows, split the issue. Add a "Who it is for" section to every new issue, using the personas above. For a task that changes UI, add a Design section that links its Claude Design file and embeds the light and dark screenshots from `design-assets`. If no design file covers the change, add or update the design first.

Record new backlog entries in `docs/features.md` with their issue number.

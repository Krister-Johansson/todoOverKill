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
    __root.tsx              html, theme, live region, skip link
    _app.tsx                Shell layout: sidebar, top bar, assistant panel
    _app/index.tsx          Dashboard
    _app/projects.$projectId.tsx          Project layout with view tabs
    _app/projects.$projectId.board.tsx
    _app/projects.$projectId.list.tsx
    _app/projects.$projectId.settings.tsx
    _app/tasks.$taskId.tsx  Task detail (full page; also rendered in a dialog)
    _app/settings.tsx
    _app/help.tsx
    api/v1/...              REST server routes
    api/mcp.ts              MCP server route
    api/chat.ts             TanStack AI chat route
    api/openapi[.]json.ts
  components/
    ui/                     shadcn primitives (generated, edit sparingly)
    app/                    Composed components: sidebar, task-card, board-column, assistant-panel, voice-button, ...
  server/
    projects.ts             Service functions: createProject, listProjects, ...
    statuses.ts
    tasks.ts
    subtasks.ts
    labels.ts
    comments.ts
    activity.ts
    search.ts
    db.ts                   Prisma client singleton
    seed.ts                 Demo data for pnpm db:seed (projects TOK and DEMO)
  fns/                      createServerFn wrappers used by routes and client tools
  tools/
    definitions.ts          toolDefinition() for every domain tool (name, description, Zod in/out)
    server.ts               .server() implementations calling src/server
    client.ts               .client() implementations for UI-only tools (navigate, open task, filter, theme)
    webmcp.ts               Registers tools on document.modelContext
    mcp.ts                  Maps definitions onto @modelcontextprotocol/sdk McpServer
  schemas/                  Zod schemas shared by forms, REST, MCP, and tools
  lib/                      Utilities: dates, cn, keyboard helpers, motion presets, speech
  hooks/                    useReducedMotion, useHotkeys, useSpeechRecognition, useSpeechSynthesis
prisma/
  schema.prisma
  migrations/
  seed.ts                   Entry for pnpm db:seed: loads .env, calls src/server/seed.ts
  test/                     Vitest and Playwright helpers: database setup and reset
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

The activity log is append-only and written by the service layer, never directly by a route or tool.

`prisma/schema.prisma` adds these rules to the field list. Ids are `cuid(2)` strings. `Project.key` is unique, and so are `(projectId, number)` on Task and `(projectId, name)` on Label. Deleting a Project deletes its statuses, tasks, labels, and activity. Deleting a Task deletes its subtasks, task labels, and comments. A Status that tasks still use cannot be deleted (the foreign key is `RESTRICT`), so a service that removes a status has to move its tasks first. `Activity.taskId` is nullable and set to null when the task is deleted, so the project history keeps the entry. `dueDate` is a PostgreSQL `date`: a calendar day with no time or zone. TaskLabel has `(taskId, labelId)` as its primary key and a separate index on `labelId` for filtering tasks by label.

## Service layer

`src/server/*.ts` exports plain async functions. Each takes already-validated input (the Zod-inferred type) and returns plain objects. They are the only place that touches Prisma. Server functions, REST handlers, MCP tools, and AI tools are thin: parse input with the shared Zod schema, call the service, shape the response.

## Web UI

- Routes load data with `loader` plus TanStack Query for client cache and invalidation.
- Mutations go through `createServerFn({ method: 'POST' })` wrappers in `src/fns/`, called from TanStack Query mutations with optimistic updates for local changes (checkbox, status move).
- URL holds view state that should survive reload: active project, view (board or list), filters, open task. Search params are validated with Zod through the route's `validateSearch`.
- Task detail opens as a dialog from the board (search param `task=`) and as a full page on direct navigation.
- Theme is a `class` on `html`, persisted in `localStorage`, with both themes defined as CSS variables in `src/styles.css`.
- Drag and drop with `@dnd-kit`, keyboard sensors enabled, and a visible "Move to" menu on every card as the non-drag path.

## REST API

Base path `/api/v1`, implemented as TanStack Start server routes (`createFileRoute` with `server.handlers`). JSON in and out. No auth. Errors return `{ error: { code, message, issues? } }`.

```
GET    /projects                 list
POST   /projects                 create
GET    /projects/:id
PATCH  /projects/:id
DELETE /projects/:id             archive (soft)
GET    /projects/:id/statuses
GET    /projects/:id/tasks       filters: status, priority, label, due, q
POST   /projects/:id/tasks
GET    /tasks/:id
PATCH  /tasks/:id                fields, status, order (move)
DELETE /tasks/:id
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

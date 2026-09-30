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
  seed.ts
docs/
tests/
  unit/                     Vitest
  e2e/                      Playwright
```

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

- Vitest against the service layer with a real test database (`DATABASE_URL_TEST`), reset between test files.
- Playwright for user flows. Every spec that opens a page or dialog runs `@axe-core/playwright` with WCAG 2.2 AAA tags and fails on any violation.
- A keyboard-only smoke test walks the main flows with Tab, Enter, Space, arrows, and Escape only.
- Speech APIs are mocked in Playwright with `page.addInitScript`; tests assert the transcript flow, not recognition quality.
- Contrast is checked in CI by a script that reads the theme CSS variables and computes ratios for every foreground and background pair.
- The MCP endpoint is tested with the SDK's client over HTTP in Vitest.

## Local infrastructure

`docker-compose.yml` starts PostgreSQL on port 5434 (5432 and 5433 are already in use on the development machine). `.env.example` documents `DATABASE_URL`, `DATABASE_URL_TEST`, `OPENROUTER_API_KEY`, and `OPENROUTER_MODEL`. Environment variables are validated with `t3env`.

## Scaffold

The app is created with the TanStack CLI so the add-ons are wired the way the framework expects:

```bash
npx @tanstack/cli create . --framework react --toolchain eslint --add-ons shadcn,prisma,tanstack-query,form,table,t3env,ai,mcp -y
```

The `ai` and `mcp` add-ons give a starting chat route and MCP route; both are then rewritten to use `src/tools/`.

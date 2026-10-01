# todoOverKill

A local, single-user project management tool built as a demo of WCAG 2.2 AAA accessibility. One domain model is exposed four ways: the web UI, a REST API, an MCP server, and an in-page AI assistant that the user can talk to (Chrome speech recognition and synthesis) and that browser agents can drive through WebMCP.

Read `docs/` before building anything. `docs/project.md` says what the product is, `docs/architecture.md` says how it is built, `docs/accessibility.md` is the AAA contract every UI change must satisfy, and `docs/features.md` is the backlog. GitHub issues mirror `docs/features.md`; the issue is the source of truth for scope and acceptance criteria.

## Stack

- TanStack Start (React, file-based routes, `createServerFn`, server routes for public endpoints)
- TanStack Query, TanStack Form, TanStack Table
- Tailwind CSS and shadcn/ui
- Prisma with PostgreSQL (local Docker, see `docker-compose.yml`)
- TanStack AI (`@tanstack/ai`, `@tanstack/ai-react`, `@tanstack/ai-openrouter`) for the assistant, with OpenRouter as the model provider
- Web Speech API (`SpeechRecognition`, `speechSynthesis`) for voice, Chrome only, feature-detected
- WebMCP (`navigator.modelContext` / `document.modelContext`) to expose page tools to browser agents, feature-detected
- `@modelcontextprotocol/sdk` for the server-side MCP endpoint at `/api/mcp`
- Motion (`motion` package) for animation, always gated on `prefers-reduced-motion`
- Zod for validation at every boundary (forms, REST, MCP, AI tools)
- Vitest for unit tests, Playwright with `@axe-core/playwright` for end-to-end and accessibility tests

Package versions are whatever is current at install time. Check the installed package's docs (Context7 or `node_modules/<pkg>/docs`) before using an API; do not rely on remembered signatures. TanStack Start, TanStack AI, and WebMCP change often.

## Commands

```bash
pnpm install
docker compose up -d          # PostgreSQL on localhost:5434
pnpm db:migrate               # prisma migrate dev
pnpm db:seed                  # demo data
pnpm dev                      # http://localhost:5173 (or $PORT)
pnpm test                     # vitest
pnpm test:e2e                 # playwright, includes axe checks
pnpm lint && pnpm typecheck
```

## Rules

- No authentication. The app is local and single-user. Do not add login, sessions, or user tables.
- Every interactive element is reachable and operable by keyboard alone. Every drag-and-drop action has a keyboard and button equivalent. Voice is an addition, never the only way to do something.
- Contrast is 7:1 for text and 3:1 for UI components, in light and dark themes. Do not introduce a colour without checking it against `docs/accessibility.md`.
- Pointer targets are at least 44 by 44 CSS pixels.
- Animation is decorative only. Nothing depends on an animation finishing. With `prefers-reduced-motion: reduce`, transitions collapse to instant or opacity-only.
- Business logic lives in `src/server/` and is called from server functions, REST handlers, MCP tools, and AI tools alike. Do not duplicate logic in any of those layers.
- Tools are defined once with `toolDefinition()` in `src/tools/` and reused by the AI assistant, the MCP server, and WebMCP. One definition, several transports.
- Validate with Zod at the boundary. Types flow from the Zod schema, not the other way around.
- Every feature ships with tests: unit for the service layer, Playwright for the UI, and an axe run on every new page or dialog.
- Match the surrounding code. Use existing shadcn components before adding new ones.
- Speech and WebMCP APIs exist only in some browsers. Feature-detect, hide the control when missing, never throw.

## Working in issues and pull requests

- One issue is one pull request, or one PR in a stack. An issue should be reviewable in under 15 minutes: a few files, one concern. If the work grows, split the issue rather than the PR.
- Branch name: `<issue-number>-<short-slug>`. Commit messages: imperative, one line under 72 characters, optional body explaining why. PR body ends with `Closes #N`.
- Do not start an issue whose "depends on" issues are still open.
- Keep the docs in `docs/` true. If the implementation diverges from them, change the docs in the same PR.

## Definition of done for a feature

1. Acceptance criteria in the issue are met.
2. Keyboard-only walkthrough works, screen reader announces state changes, axe reports zero violations.
3. Works in light and dark theme and at 400% zoom without horizontal scroll.
4. Unit and e2e tests pass. `pnpm lint` and `pnpm typecheck` are clean.
5. If the feature touches data, the REST, MCP, and AI tool surfaces expose it.

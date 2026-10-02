# todoOverKill

A local, single-user project management tool built as a WCAG 2.2 AAA accessibility demo. The web UI, a REST API, an MCP server, and an in-page AI assistant all use the same domain model.

The docs in `docs/` describe the product (`project.md`), how it is built (`architecture.md`), the accessibility rules (`accessibility.md`), and the backlog (`features.md`).

## Commands

Requires Node 24 or later and pnpm.

```bash
pnpm install
cp .env.example .env          # database URL and optional OpenRouter settings
docker compose up -d          # PostgreSQL on localhost:5434
pnpm db:migrate               # prisma migrate dev
pnpm db:generate              # prisma generate, also runs on install
pnpm db:seed                  # demo data
pnpm dev                      # http://localhost:5173 (or $PORT)
pnpm test                     # vitest, needs Docker
pnpm test:e2e                 # playwright, includes axe checks, needs Docker
pnpm check:contrast           # contrast of the theme tokens, light and dark
pnpm lint && pnpm typecheck
```

`pnpm lint` runs ESLint and then `pnpm check:contrast`, which reads the theme tokens in `src/styles.css` and fails if a pair listed in `scripts/check-contrast.ts` is under 7:1 for text or 3:1 for borders and the focus ring. A new colour token needs a value in both themes and a row in that list, or the check fails. Theme colours go only in the top-level `:root` and `.dark` blocks; the check fails on one set anywhere else. It also fails if a class under `src/` draws a theme colour with an opacity modifier, such as `ring-ring/50` or `bg-input/30`, because that renders a colour it did not check. Components added with the shadcn CLI use these modifiers, so edit them to use the full tokens. The focus outline is defined outside any cascade layer, so `outline-none` in a component does not remove it.

The compose file creates a `todo` user with password `todo` and the database `todo_over_kill`. `pnpm dev`, `pnpm build`, and `pnpm preview` read `.env`. Variables exported in your shell override the values in `.env`. The dev and preview servers exit with a list of the missing or invalid variables if validation fails. The built `dist/server/server.js` runs the same check when it loads, but it does not read `.env`, so anything that loads it outside `pnpm preview` has to set the variables itself, for example with `node --env-file=.env`.

The tests no longer use a `todo_over_kill_test` database in the compose container. A `db-data` volume created before this change still has one, unused. Remove it with `docker compose exec db dropdb -U todo todo_over_kill_test`.

`pnpm install` runs `prisma generate`, which writes the client to the gitignored `src/generated/prisma` and works without a `.env`. Since Prisma 7, `pnpm db:migrate` does not regenerate the client, so run `pnpm db:generate` after every schema change.

`pnpm test` and `pnpm test:e2e` need Docker and nothing else: no `.env`, no compose database, and no database created by hand. Each run starts its own PostgreSQL container with [Testcontainers](https://node.testcontainers.org/), from the image in `docker-compose.yml`, applies the migrations, and stops the container when the run ends. Only the server tests use it, so `pnpm exec vitest run --project client`, or a single component test, needs no Docker. The container gets a random password per run, because Docker publishes its port on every host interface. Testcontainers finds Docker through `DOCKER_HOST` or the default socket, and also starts a small `testcontainers/ryuk` container that removes a test container if the run is killed before it can stop it. The first run pulls both images. Without Docker the run stops and says so. The GitHub Actions workflow in `.github/workflows/ci.yml` uses the runner's Docker the same way.

`pnpm test:e2e` also needs Chromium. Install it once with `pnpm exec playwright install chromium`. The run builds the app and serves it against its container on a free port the OS picks, so it never touches the app database. Export `E2E_PORT` to choose the port; the run then fails if something already answers there, rather than reusing a server that points at another database.

Runs never share a database or a port, so `pnpm test` and `pnpm test:e2e` can run in several worktrees at once.

`pnpm db:seed` runs `prisma/seed.ts` through tsx. It deletes the demo projects TOK and DEMO, with everything in them, and creates them again, so running it twice leaves the same data as running it once. Projects with other keys are not touched. Due dates and activity times are relative to the time of the run.

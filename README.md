# todoOverKill

A local, single-user project management tool built as a WCAG 2.2 AAA accessibility demo. The web UI, a REST API, an MCP server, and an in-page AI assistant all use the same domain model.

The docs in `docs/` describe the product (`project.md`), how it is built (`architecture.md`), the accessibility rules (`accessibility.md`), and the backlog (`features.md`).

## Commands

Requires Node 24 or later and pnpm.

```bash
pnpm install
cp .env.example .env          # database URLs and optional OpenRouter settings
docker compose up -d          # PostgreSQL on localhost:5434
pnpm db:migrate               # prisma migrate dev
pnpm db:seed                  # demo data
pnpm dev                      # http://localhost:3000
pnpm test                     # vitest
pnpm test:e2e                 # playwright, includes axe checks
pnpm lint && pnpm typecheck
```

The compose file creates a `todo` user with password `todo` and the database `todo_over_kill`. Its init script also creates `todo_over_kill_test`, the database for `DATABASE_URL_TEST`. `pnpm dev`, `pnpm build`, and `pnpm preview` read `.env`. Variables exported in your shell override the values in `.env`. The dev and preview servers exit with a list of the missing or invalid variables if validation fails. `DATABASE_URL_TEST` is required at startup even though only the tests connect to it. The built `dist/server/server.js` runs the same check when it loads, but it does not read `.env`, so anything that loads it outside `pnpm preview` has to set the variables itself, for example with `node --env-file=.env`.

The init script only runs when the `db-data` volume is created empty. If the volume existed before the script was added and `todo_over_kill_test` is missing, create it with `docker compose exec db createdb -U todo todo_over_kill_test`, or start over with `docker compose down -v`, which deletes all data.

Some of these commands depend on backlog items that are not done yet:

- `pnpm db:migrate` needs the Prisma config and schema from F03.
- `pnpm db:seed` needs the seed script from F04.
- `pnpm test:e2e` needs the Playwright setup from F06.

# todoOverKill

A local, single-user project management tool built as a WCAG 2.2 AAA accessibility demo. The web UI, a REST API, an MCP server, and an in-page AI assistant all use the same domain model.

The docs in `docs/` describe the product (`project.md`), how it is built (`architecture.md`), the accessibility rules (`accessibility.md`), and the backlog (`features.md`).

## Commands

Requires Node 24 or later and pnpm.

```bash
pnpm install
docker compose up -d          # PostgreSQL on localhost:5434
pnpm db:migrate               # prisma migrate dev
pnpm db:seed                  # demo data
pnpm dev                      # http://localhost:3000
pnpm test                     # vitest
pnpm test:e2e                 # playwright, includes axe checks
pnpm lint && pnpm typecheck
```

Some of these commands depend on backlog items that are not done yet:

- `docker-compose.yml` and the database settings arrive in F02, so `docker compose up -d` and `pnpm db:migrate` do not work before then.
- `pnpm db:seed` needs the seed script from F04.
- `pnpm test:e2e` needs the Playwright setup from F06.

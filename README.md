# Design assets

This branch holds screenshots of the todoOverKill design so GitHub issues can embed them. It has no app code and never merges into main.

- `design/v2/` is the current design, "refined product". Its source is the Claude Design project "todoOverKill: refined product design" (project id `6030b21d-a242-48b1-b104-39cc6d92af81`).
- `design/*.png` at the top level is the first draft, "industrial utility" (project id `ec1de6ba-9414-4da3-ae56-f275aec25123`). It is kept for history only; do not build from it.

Each PNG is a full-page render at 1440 px wide of the `.dc.html` file with the same name, in the light and dark theme. `design/v2/tokens.css` lists the proposed theme tokens; every pair passes `scripts/check-contrast.ts` from main, and `--border-subtle` is decorative only.

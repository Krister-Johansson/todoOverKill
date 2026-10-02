# Design assets

This branch holds screenshots of the todoOverKill redesign ("industrial utility") so GitHub issues can embed them. It has no app code and never merges into main.

The source of truth is the Claude Design project "todoOverKill: industrial utility redesign" (project id `ec1de6ba-9414-4da3-ae56-f275aec25123`). Each PNG is a full-page render at 1440 px wide of the `.dc.html` file with the same name, in the light and dark theme.

`design/tokens.css` lists the proposed theme tokens. Every pair passes `scripts/check-contrast.ts` from main (7:1 for text, 3:1 for borders, rings and marks), plus the new `--signal` and `--signal-foreground` pairs.

# Project description

todoOverKill is a project management tool for one person, running on their own machine. It exists to show several things done well at the same time: an interface that meets WCAG 2.2 at level AAA, a product that looks and feels like a commercial project tool, and one domain model reachable from a web UI, a REST API, an MCP server, an in-page AI assistant, voice, and browser agents through WebMCP.

It is a demo. There is no login, no multi-user support, no hosting story. Data lives in a local PostgreSQL database.

## Who it is for

The primary user is a person managing their own work across a few projects. They open the app, see what needs attention today, move tasks between stages, add notes, and close things out. They can also say "move the login bug to in progress" and have it happen.

Secondary users are agents: an MCP client such as Claude Code connected to `/api/mcp`, and a browser agent that discovers the page's WebMCP tools.

## What it does

- Organises work into projects. Each project has a board (columns are statuses), a list view, and an overview page.
- Tasks have a title, description (Markdown), status, priority, due date, labels, a checklist of subtasks, comments, and an activity log.
- A dashboard across projects shows what is due, what is overdue, and what changed recently.
- Global search and a command palette reach any project, task, or action from the keyboard.
- An assistant panel answers questions about the work and performs actions through tools. It uses TanStack AI with OpenRouter as the provider, so the model is configurable.
- The user can press a button (or a key) and speak to the assistant. The assistant can read its replies aloud. Both use the browser's own speech APIs. The app itself sends only text to OpenRouter; Chrome's recognition service may process the audio on Google's servers, and the Help page says so.
- The page registers its tools with WebMCP, so a browser-integrated agent can operate the app without the assistant panel.
- Everything the UI can do, the REST API and MCP server can do.

## Look and feel

The reference point is tools like Linear and Height: dense but calm, strong typography, restrained colour, motion that explains state changes rather than decorates. Layout is a left sidebar for navigation, a top bar for context, search, and the voice button, and a content area. The assistant opens as a right-hand panel. Light and dark themes, both meeting AAA contrast.

The design direction is called "refined product": a lightly tinted canvas with white cards, soft layered shadows, rounded corners (8 px controls, 10 px cards, 16 px dialogs), Geist for text and Geist Mono for task keys. A deep indigo carries primary actions, and a brighter violet highlight marks the current place, focus and live states. Quiet dividers are decorative; anything a person needs to see to use a control keeps 3:1 contrast. Every screen is drawn in the Claude Design project "todoOverKill: refined product design" (https://claude.ai/design/p/6030b21d-a242-48b1-b104-39cc6d92af81). The app moves to this look through the redesign tasks R1 to R11 in `features.md`; until R1 lands, `src/styles.css` still holds the earlier tokens.

Motion guidelines:

- Transitions between views are short (150 to 250 ms) and use opacity and small translations.
- List reorders and column moves animate layout so the user can follow where an item went.
- Dialogs and popovers scale in from 96% with a fade.
- With `prefers-reduced-motion: reduce`, everything becomes instant or fade-only. Nothing moves.
- No animation runs longer than 500 ms. No animation loops except an explicit loading indicator, and that has a pause control if it is on screen for more than five seconds.

## Voice and assistant principles

- Voice input is a toggle: press the microphone button (or its key) to start listening, press again or Escape to stop. Nothing listens until the user asks, and a visible, announced indicator shows when the microphone is open.
- Recognised speech appears as text the user can edit before it is sent. The assistant never acts on speech the user has not seen.
- Every spoken reply also appears as text. Speech can be stopped with one key.
- Destructive tools (delete, archive) require the user to confirm in the UI, whether the call comes from the assistant, voice, WebMCP, or MCP.
- The assistant is optional. If `OPENROUTER_API_KEY` is missing, the panel explains that and the rest of the app works as before.

## Accessibility as a product requirement

AAA is the acceptance bar, not a stretch goal. The full list of criteria and how each one is met lives in `accessibility.md`. In summary: keyboard operates everything, contrast is 7:1, targets are 44 px, no time limits, no motion the user cannot switch off, help is consistent, and the user is never asked to enter the same thing twice.

## Out of scope

- Authentication, users, permissions, sharing.
- Real-time collaboration.
- Mobile native apps. The web UI is responsive and works on a phone.
- Integrations with third-party services beyond OpenRouter and the MCP server.
- Deployment. It runs with `pnpm dev` or `pnpm build && pnpm start` on localhost.
- Browsers other than Chrome for voice and WebMCP. The rest of the app works in any modern browser.

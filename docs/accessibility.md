# Accessibility contract: WCAG 2.2 level AAA

Every UI change is measured against this document. The list covers the success criteria that apply to this product and states how each is met. Criteria that do not apply (video, live captions, sign language) are omitted. The voice features bring a few audio criteria into scope; they are listed under "Voice and assistant".

The WCAG 2.2 text is at https://www.w3.org/TR/WCAG22/. Numbers below refer to it.

## Perceivable

1.1.1 Non-text content (A). Every icon-only button has an `aria-label`. Decorative icons are `aria-hidden`. Project colour swatches carry the colour name in text.

1.3.1 Info and relationships (A). Semantic HTML first: `nav`, `main`, `header`, lists for lists, tables for tabular data, `h1` to `h3` in order. The board is a list of lists, each column an `h2`. The list view is a data table with a `caption` naming the project and its task count, `th scope="col"` on every column, and `aria-sort` on the sorted column's `th` only; the button inside each header changes the sort. Form fields are associated with labels with `for`/`id`, never placeholder-only.

1.3.2 Meaningful sequence (A). DOM order matches visual order. No CSS `order` tricks that break reading order.

1.3.3 Sensory characteristics (A). Instructions never rely on shape, position, or colour alone.

1.3.4 Orientation (AA). No orientation lock.

1.3.6 Identify purpose (AAA). Landmarks are labelled (`aria-label` on `nav`, `main`, `aside`). Icons use consistent, recognisable symbols and always pair with text or an accessible name.

1.4.1 Use of colour (A). Priority and status are shown with an icon and text, not colour alone. Overdue dates show a label, not just red.

1.4.3 / 1.4.6 Contrast (AA / AAA). Text contrast is at least 7:1. Large text (24 px, or 19 px bold) is at least 4.5:1. Both themes are defined in `src/styles.css` and the pairs are verified by `scripts/check-contrast.ts` in CI.

1.4.4 Resize text (AA). Layout works at 200% browser zoom.

1.4.8 Visual presentation (AAA). Line width of prose (task descriptions, comments, assistant replies) is capped at 80 characters; text is not justified; line height is at least 1.5; paragraph spacing at least 1.5 times line height; text resizes to 200% without horizontal scroll; foreground and background are user-selectable through the theme.

1.4.10 Reflow (AA). At 320 px wide, or 400% zoom, content reflows to one column. The board becomes a stacked list of columns. A data table is exempt from one-column reflow, because it needs two dimensions to make sense, so the list view keeps its columns. The page still never scrolls sideways: cells wrap, and a table that is still too wide scrolls inside its container, which is then a focusable region labelled "Task table" so the keyboard can scroll it.

1.4.11 Non-text contrast (AA). Borders of inputs, focus rings, icons, and checkbox marks are at least 3:1 against adjacent colours. Project and label colours come from the named palette in `src/lib/project-colors.ts`, not a free colour picker; each is at least 3:1 against every `CHIP_SURFACES` token (page, card, popover and sidebar) in both themes, which `src/lib/project-colors.test.ts` checks, and the colour's name is shown wherever it is chosen. A label chip's 2 px border is its label colour, or the theme border for a colour outside the palette. Some palette colours fall below 3:1 on dark `--accent`, which a hovered card paints, so the chip carries its own `--background` fill and its border always sits on a checked surface; `tests/e2e/board.spec.ts` checks this on a hovered card in the dark theme.

1.4.12 Text spacing (AA). No fixed heights on text containers.

1.4.13 Content on hover or focus (AA). Tooltips are dismissable with Escape, hoverable, and persist until dismissed or the pointer leaves.

## Operable

2.1.1 / 2.1.3 Keyboard (A / AAA). Every action is available from the keyboard with no exceptions. Drag and drop has keyboard sensors plus a "Move to" menu. Voice is never the only path.

2.1.2 No keyboard trap (A). Dialogs trap focus intentionally and always release on Escape and on close.

2.1.4 Character key shortcuts (A). Single-key shortcuts (like `c` to create a task) are active only when focus is not in a text field, and can be turned off in Settings.

2.2.1 / 2.2.3 Timing (A / AAA). There are no time limits. Toasts stay until dismissed or until the user moves on; they never auto-dismiss with content the user needs. The microphone does not close on a timer; it closes when the user presses the button again or Escape.

2.2.2 Pause, stop, hide (A). Any loading indicator visible for more than five seconds has a pause control. Streaming assistant replies can be stopped.

2.2.4 Interruptions (AAA). No notifications interrupt the user. Background updates surface only on user action.

2.2.6 Timeouts (AAA). No session timeouts exist.

2.3.1 / 2.3.2 Flashes (A / AAA). Nothing flashes. The microphone indicator changes state, it does not blink.

2.3.3 Animation from interactions (AAA). All motion is disabled under `prefers-reduced-motion: reduce`, and there is an in-app toggle that overrides the OS setting in either direction.

2.4.1 Bypass blocks (A). "Skip to content" link is the first focusable element.

2.4.2 Page titled (A). Every route sets a `title` of the form "Task title · Project · todoOverKill".

2.4.3 Focus order (A). Focus follows DOM order. When a dialog closes, focus returns to the trigger.

2.4.4 / 2.4.9 Link purpose (A / AAA). Link text alone describes the destination. No "click here", no "more".

2.4.5 Multiple ways (AA). Sidebar, search, command palette, dashboard, breadcrumbs, and the assistant.

2.4.6 Headings and labels (AA). Headings describe the section; labels describe the field.

2.4.7 Focus visible (AA). Focus ring is always visible; no `outline: none` without a replacement.

2.4.8 Location (AAA). Breadcrumbs on every page, current item marked in sidebar with `aria-current`.

2.4.10 Section headings (AAA). Content is organised under headings, including the board columns, the task detail sections, and the assistant panel.

2.4.11 / 2.4.12 Focus not obscured (AA / AAA). Sticky headers, the assistant panel, and toasts never cover a focused element. Scroll-into-view uses `block: 'nearest'` with scroll padding equal to the sticky header height.

2.4.13 Focus appearance (AAA). Focus indicator is a 2 px solid outline with 2 px offset, contrast at least 3:1 against both the element and its background, enclosing the whole component.

2.5.1 Pointer gestures (A). No multi-point or path-based gestures.

2.5.2 Pointer cancellation (A). Actions fire on `click` (up event), not `pointerdown`. Drag can be cancelled with Escape. The microphone button is a toggle that fires on click, and the transcript is reviewable before anything happens.

2.5.3 Label in name (A). Visible label text is the start of the accessible name.

2.5.4 Motion actuation (A). No device-motion input.

2.5.5 Target size (AAA). Every target is at least 44 by 44 CSS pixels, including checkboxes and icon buttons. Inline links in prose are exempt per the criterion.

2.5.6 Concurrent input mechanisms (AAA). Mouse, keyboard, touch, and voice all work at all times.

2.5.7 Dragging movements (AA). Every drag has a single-pointer alternative (the Move menu).

## Understandable

3.1.1 Language of page (A). `<html lang="en">`.

3.1.3 Unusual words (AAA). Product terms (Backlog, Priority, Label, Assistant, WebMCP) are defined in the in-app Help page, linked from the sidebar.

3.1.4 Abbreviations (AAA). Project keys (like TOK-42) show the full project name in a tooltip and `abbr` element.

3.1.5 Reading level (AAA). UI copy is short, plain sentences. The help page avoids jargon. The assistant's system prompt asks for plain language and short replies.

3.2.1 / 3.2.2 On focus / on input (A). Nothing changes context on focus or on input; forms submit on explicit action.

3.2.3 Consistent navigation (AA). Sidebar and top bar are identical on every page.

3.2.4 Consistent identification (AA). Same icon and label for the same action everywhere.

3.2.5 Change on request (AAA). No automatic redirects or view changes. Filters apply on selection, but that is the requested action and the results region announces the change. When the assistant navigates on the user's behalf, the panel says where it went and focus moves to the new page heading.

3.2.6 Consistent help (A). The Help link is in the same sidebar position on every page.

3.3.1 Error identification (A). Errors are text, next to the field, linked with `aria-describedby`, and summarised at the top of the form with links to each field.

3.3.2 Labels or instructions (A). Every field has a visible label. Required fields say "required" in the label.

3.3.3 Error suggestion (AA). Error messages say how to fix the problem.

3.3.4 / 3.3.6 Error prevention (AA / AAA). Destructive actions (delete project, delete task) require confirmation, on every path including assistant, voice, WebMCP, and MCP. Every submission can be reviewed before it is sent. Deletes are reversible for 10 seconds through an Undo action in the toast, and archived projects can be restored.

3.3.7 Redundant entry (A). Creating a task from a project pre-fills the project. Editing never asks for information the app already has.

3.3.8 / 3.3.9 Accessible authentication (AA / AAA). No authentication exists.

## Robust

4.1.2 Name, role, value (A). Custom widgets (board, command palette, combobox, assistant composer) follow the WAI-ARIA Authoring Practices patterns, using shadcn/Radix primitives where they exist.

4.1.3 Status messages (AA). Save confirmations, filter result counts, move announcements ("Moved TOK-42 to In progress"), microphone state ("Listening", "Stopped listening"), and speech state go through a polite `aria-live` region. Errors use `role="alert"`.

## Voice and assistant

1.2.1 Audio-only (A) and 1.4.2 Audio control (A). Spoken replies are the same text shown in the panel. Speech never starts automatically on page load; the user turns it on in Settings and can stop it with a button or Escape.

1.4.7 Low or no background audio (AAA). The only audio is synthesised speech; there is no background audio.

Speech recognition is not required to use any feature. Every voice command has a keyboard and pointer equivalent. Recognised text is shown and editable before it is sent. While listening, the button is `aria-pressed="true"` and the live region announces "Listening".

## Testing procedure per feature

1. Run `pnpm test:e2e`; axe with tags `wcag2a`, `wcag2aa`, `wcag2aaa`, `wcag21a`, `wcag21aa`, `wcag22aa` must report zero violations.
2. Walk the feature with keyboard only. Note the focus order.
3. Walk the feature with VoiceOver (macOS) and confirm every state change is announced.
4. Zoom to 400%. Confirm no horizontal scroll and no obscured focus.
5. Switch to dark theme. Repeat step 1.
6. Enable Reduce Motion in the OS. Confirm nothing moves.
7. If the feature touches the assistant or voice: confirm it works with the microphone denied and with the speech APIs absent.

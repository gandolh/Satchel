# Satchel web design: Clay on graphite

What shipped for brief 05, recorded from the code. The long form, with the reasons, is
`corpus/wiki/design.md`; the choices that changed are in `corpus/wiki/decisions.md`.

## Direction

A conventional messenger: a chat list, a thread, a bottom tab bar on a phone, a side rail from 900 px. Graphite
neutrals carry the screens, and one warm colour, clay, means "act": my bubbles, unread times and badges, the New chat
button, Send. Claude's green stays on its avatar and the pinned Ideas inbox row.

## Tokens

All in `src/styles/index.css`, inside `@theme`. A colour holds both themes in one `light-dark()` value, and
`color-scheme` on `<html>` picks one (Light, Dark or System, in Settings; light on a first visit).

- Surfaces: `bg` (the thread), `surface` (list, bars, composer, cards), `sunk` (field fill), `control` (secondary
  buttons, avatars, day pills), `bubble-in`, `rail`. In dark the list sits 1.17 above the thread.
- Text: `ink`, `ink-2` (previews), `muted` (times, hints). Edges: `line` (hairlines), `outline` (fields, checkbox, switch,
  at 3:1).
- Clay: `accent`, `accent-press`, `accent-ink`, `accent-soft` with `on-accent-soft`; bubbles `sent`, `on-sent`,
  `on-sent-meta`.
- Green: `ok`, `on-ok`, `ok-soft`, `on-ok-soft`. Error: `bad`. Rings: `focus`, `focus-rail`.
- Radii: `sm` 6, `md` 10, `bubble` 18, `pill`. Shadow: `float` (soft in light, a hairline alone in dark).
- Type: Rethink Sans, `@fontsource/rethink-sans` at 5.3.0, 400/600/700. `small` 12/16, `compact` 14/20, `body` and
  `input` 16/24, `heading` 20/28 at 700, `hero` 28 for the brand mark. IBM Plex Mono for the Claude token.
- `lib/cn.ts` lists the custom size, radius and shadow names for tailwind-merge; keep it in step with `@theme`.
- The browser bar's accent is written three times and `settings/theme.test.ts` keeps them equal: `THEME_COLOR`, the boot
  script in `index.html` and the manifest's `theme_color` in `vite.config.ts`.

## Layout

- Under 900 px: one screen at a time; the tab bar (Chats, Settings) under the list, Settings and New chat, hidden in a
  thread; a 56 px clay New chat button bottom right, 16 px above the tab bar; the group form's count, Cancel and Create
  group pinned to a bar above the tab bar.
- From 900 px: a 72 px rail (the clay S, Chats, Settings; the current place a pill), a 340 px list with the pencil in
  its header, and the pane. `--breakpoint-wide` and `WIDE_QUERY` in `src/polling.ts` are equal, and a test keeps them so.
- Bars are 56 px (64 from 900 px); phone targets are 48 px; Buttons are 40 px with a taller hit area.

## Patterns

- One filled primary per screen (Send, Create group, Sign in); the secondary is the `control` pill (`Button` variant
  `quiet`); a disabled button is a pale clay wash with muted text.
- Rows: the open chat is the strongest (`control` fill, a surface avatar, bold name, 4 px clay bar); unread is a clay
  time and a numbered badge, still read aloud.
- Bubbles: mine clay, theirs `bubble-in` with a hairline. A run from one person joins (6 px corner, 2 px gap), the
  sender's name tops a group's first bubble, and every bubble keeps its time. Ticks are drawn icons: one sent, two
  seen. A sending bubble stays at full colour with "Sending…".
- Motion is colour only, 120 ms, `motion-safe:`; reduced motion removes it.

## Checks

`npm run test:e2e -w @satchel/web` (Playwright, two workers) walks every screen in light, dark and system: a focus ring
on every Tab stop, nothing moving under reduced motion, no sideways scroll at 390 px, the layout switch at 899, 900 and
901 px, and the theme switch. `SHOTS_DIR=<folder> npx playwright test shots` takes the screenshots. The specs answer the
API from `e2e/fixtures.ts`, with a frozen clock. `src/styles/contrast.test.ts` measures the token pairs in both themes.

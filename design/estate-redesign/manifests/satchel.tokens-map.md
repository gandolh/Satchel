# Satchel tokens: board role to app token

Mechanism: the app's own, kept. Every colour is `light-dark()` inside `@theme`, picked by `color-scheme` on `:root`; the one new shadow uses `light-dark()` too, so there is no `[data-theme="dark"]` block. `satchel.tokens.css` replaces the colour, shadow, font, radius and type groups of `web/src/styles/index.css`. The board's palette is graphite plus clay (today: green-grey plus blue), so every colour value moves.

## Renamed or remapped (board role to app token)
- ground -> `bg`; field -> `sunk` (inputs; day pills move to `control`); rule -> `line`
- surface, ink, muted, accent, bad: same names, new values
- accent-hover -> `accent-press` (a `color-mix` today, both values given); on-accent -> `accent-ink`; accent-wash -> `accent-soft`
- claude -> `ok`, claude-wash -> new `ok-soft`, on-claude -> new `on-ok` (Claude's roles keep the app's `ok`; the pinned row's two derived mixes now read `ok-soft` and `ok`)
- row-hover: a `color-mix` today, now a plain pair
- fonts: Rethink Sans replaces Familjen Grotesk (`font-title`) and Instrument Sans (`font-body`); `font-mono` unchanged. The `@fontsource/rethink-sans` 400/600/700 imports (latin and latin-ext, vendor layer) replace the Familjen and Instrument ones, and `index.html`'s preloads follow
- sizes: board 12 -> `text-small`, 14 -> `text-compact`, 16/24 -> `text-body` (was 15) and `text-input`, 20/28 700 -> `text-heading` (was 20 without leading). Line height and weight ride on each size as `--text-*--line-height|font-weight`; `body`'s 1.45 and `h1..h3`'s `font-title` 1.2 rules in `@layer base` can go
- radii: tight 6 -> `radius-sm`, control 10 -> `radius-md`, full -> `radius-pill`
- spacing: the board's 4 8 12 16 20 24 32 40 48 64 are Tailwind's default 4 px scale; no tokens
- the base layer's `:focus-visible` outline moves from `accent` to the new `focus` (`focus-rail` on the rail)

## New tokens (component that needs them)
- `control`, `control-hover`: secondary buttons (Create group, Cancel), avatars, day pills
- `outline`: field, checkbox and switch edges
- `ink-2`: chat-row previews and other secondary text
- `on-accent-soft`: text on the current tab and a picked person
- `sent`, `on-sent`, `on-sent-meta`, `bubble-in`: message bubbles (my bubble is a darker clay in dark; other people's bubble differs from surface in dark)
- `on-ok`, `ok-soft`, `on-ok-soft`: Claude's avatar letter, the pinned Ideas inbox row and its name
- `rail`, `on-rail`, `rail-current`, `on-rail-current`, `focus-rail`: the wide screen's side rail
- `focus`: every focus ring
- `shadow-float`: menus and the new-chat sheet
- `radius-bubble` (18): message bubbles

## App tokens the design no longer uses (keep or drop is the code brief's call)
- `shadow-thumb`, `shadow-lift`: the board has one shadow, `shadow-float`, and none in dark
- `radius-lg` (14)
- `text-micro`, `text-tiny`, `text-meta`, `text-title`, `text-display`, `text-hero`: the board draws four sizes (12, 14, 16, 20); avatar letters and the brand mark would map to these four unless the code brief adds sizes
- `--color-accent-press` is kept, now as the board's accent-hover
- `font-title` is now the same face as `font-body`; it can alias it

## Not mapped
- board-only `callout` (#8c0888 / #d773d0): a specimen annotation colour on the direction sheet

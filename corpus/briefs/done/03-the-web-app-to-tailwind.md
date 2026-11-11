# Task 03: The web app to Tailwind

**Depends on:**

- In Satchel:
  - brief 01, for the gate, the formatter and the `.claude/rules/web.md` this brief extends;
  - brief 02, which puts the Base UI wrappers in `web/src/components/ui/`, so this brief styles each part once, in its final place.
- In the owner's skills library:
  - brief 02, *A base-ui skill, styled with Tailwind*: rules 4-8, the `tailwind.md` reference and the method in `migrating-from-plain-css.md`;
  - brief 27, *A house style, and a quality harness that enforces it*: the `better-tailwindcss` lint;
  - brief 10, *Satchel's web app to Tailwind*, the estate draft this brief replaces.
- The owner's grilling of 2026-11-10:
  - Q17 (token names), Q18 (dark mode), Q19 (visual parity), Q20 (the order of the migrations);
  - Q44 (the root font size), Q60 and Q62 (tests, the type scale).

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)); if it is still down (since 2026-10-13), say so in the outcome note.

## Context

The owner's call of 2026-11-09: Base UI is styled with Tailwind v4, and whole apps move to Tailwind, not only the Base UI parts. Satchel's web app is plain CSS on tokens today. This brief moves all of it to Tailwind 4.3.5 with the looks unchanged, in light and dark, and it is the deep version of the skills library's draft (its brief 10). Where this brief and that draft disagree, this brief was measured against the code on 2026-11-10.

### Corrections to the estate draft

- **Tokens.** `web/src/styles/tokens.css` has 38 custom-property definitions, but **27 distinct tokens**: 11 of them (`--bg`, `--surface`, `--sunk`, `--ink`, `--muted`, `--line`, `--accent`, `--accent-ink`, `--accent-soft`, `--ok`, `--bad`) are defined twice, once in `:root` (lines 9-19) and once in the dark block (lines 42-56). All 27 are read somewhere (`var(--…)` over `web/src`).
- **Dark mode switches tokens, not utilities.** The dark values are one `@media (prefers-color-scheme: dark)` block on `:root` (`web/src/styles/tokens.css:42`), plus `color-scheme: light dark` (`tokens.css:8`) and `<meta name="color-scheme" content="light dark">` (`web/index.html:6`). No component CSS has a dark rule. Today no `@custom-variant dark` and no `dark:` class is needed. The owner's call of 2026-11-10 (Q18) replaces the media query with a `data-theme` switch (decision 2).
- **The root font size is not 15 px** (Q44's rule is already met). `body` sets `font-size: 15px` (`web/src/styles/base.css:18`); `html` stays at the browser's 16 px, and no CSS uses `rem` (`grep -rn "rem" web/src --include=*.css` finds only `em` letter-spacing, `layout.css:85, 179`). So Tailwind's rem-based scale lands on exact pixels: `--spacing` stays `0.25rem`, which is 4 px. The estate's "non-16 px root" gotcha does not apply here.
- **The layout switch is JavaScript.** The two-pane shell is `shell--wide`, picked by `useMediaQuery(WIDE_QUERY)` (`web/src/layout/AppShell.tsx`, `web/src/polling.ts:79`, `"(min-width: 900px)"`). The only CSS media query on width is `web/src/styles/settings.css:15`. So the 900 px breakpoint exists in two places (decision 7).

### The stylesheets today (2026-11-10)

Ten files, **1,290 lines**, all under `web/src/`. Between them:

- 190 selectors and 130 distinct class names (13 selectors are compound or descendant, listed below);
- 206 `className` attributes in 16 `.tsx` files (most: `web/src/people/NewChat.tsx` 27, `web/src/thread/ThreadScreen.tsx` 26, `web/src/settings/SignInMethods.tsx` 26, `web/src/settings/ConnectClaude.tsx` 23);
- 3 `@media` blocks: `prefers-color-scheme: dark` (`tokens.css:42`), `prefers-reduced-motion: reduce` (`base.css:71`) and `min-width: 900px` (`settings.css:15`);
- no `@container`, no `@keyframes`, 2 transitions (`web/src/push/notifications.css:36, 48`), 2 `!important` (both in the reduced-motion rule, `base.css:75-76`);
- 9 `:hover` rules, 3 focus rules, 13 `env(safe-area-inset-*)` uses (the viewport is `viewport-fit=cover`), and 2 `dvh` heights (`layout.css:12, 320`);
- 167 `px` values, 13 distinct `font-size`s (9 to 32 px, 49 uses), and no `rem`.

| File | Lines | Imported by | What it styles |
|---|---|---|---|
| `web/src/styles/layout.css` | 367 | `main.tsx` | Shell, screen, bar, icon button, tab bar, avatar, buttons (`.button`, `--quiet`, `--danger`), `.card`, `.muted`, the full-screen gate, the app mark. |
| `web/src/thread/thread.css` | 210 | `ThreadScreen.tsx` | Bubbles and their states, day separators, ticks on the accent bubble, the offline and "new messages" pills, the composer. |
| `web/src/styles/chats.css` | 171 | `main.tsx` | The chat list rows, the pinned inbox row, the badge, list notes and banner, the loading skeleton. |
| `web/src/people/people.css` | 124 | `NewChat.tsx` | New chat: the people list, **the app's shared `.field*`**, the checkbox, and `.icon-button--end` (which `ChatList.tsx` uses). |
| `web/src/auth/auth.css` | 91 | `LoginPage.tsx`, `SignInMethods.tsx` | The login panel, and the sign-in methods card (`.login__error` is shared). |
| `web/src/styles/base.css` | 78 | `main.tsx` | The page: box sizing, body type (15 px), headings, links, focus ring, `.visually-hidden`, reduced motion. |
| `web/src/push/notifications.css` | 75 | `Notifications.tsx` | The switch row, hints, and the Switch's track and thumb. |
| `web/src/settings/connect-claude.css` | 71 | `ConnectClaude.tsx` | The token list and the show-once panel. |
| `web/src/styles/tokens.css` | 56 | `main.tsx` | The 27 tokens, light and dark. |
| `web/src/styles/settings.css` | 47 | `main.tsx` | The Settings page and the account row. |

There is one CSS chunk, so import order is cascade order. Three files load by component import, but they are in the same chunk. Fonts come from 11 `@fontsource` imports in `web/src/main.tsx:8-18` (Familjen Grotesk 600/700, Instrument Sans 400/500/600, IBM Plex Mono 400, each in Latin and, but for Plex, Latin Extended).

**The 13 compound and descendant selectors** (they cannot be a single utility on one element): `.person__tick svg`, `.new-chat__actions .muted`, `.switch[data-checked] .switch__thumb`, `.skeleton-row .avatar`, `.icon-button svg`, `.shell--wide .back-button`, `.tabbar__item svg`, `.empty-pane .mark`, `.thread__day span`, `.bubble--mine .tick`, `.bubble--mine .tick--seen` (twice) and `.bubble--mine .tick:not(.tick--seen)`. Each becomes a `group-*`, `[&_svg]:` or `*:` variant, or a prop on the child.

**Built size before** (`npm run build -w @satchel/web`, 2026-11-10): `index-*.css` 20,195 bytes (4.34 kB gzip by Vite, 4,317 by `gzip -9`); `index-*.js` 366.74 kB (112.42 kB gzip); the service worker precaches 19 entries, 526.96 KiB.

### The token mapping plan

Tailwind 4.3.5's theme namespaces take most of Satchel's names unchanged. The values stay exactly as `tokens.css` has them.

| Group (`tokens.css` lines) | Count | Today | In `@theme` | Utility example |
|---|---|---|---|---|
| Colour (9-19) | 11 | `--bg`, `--surface`, `--sunk`, `--ink`, `--muted`, `--line`, `--accent`, `--accent-ink`, `--accent-soft`, `--ok`, `--bad` | `--color-<same name>`, light values; the dark values reassign the same `--color-*` in `@layer base` under `[data-theme="dark"]` | `bg-surface`, `text-ink`, `border-line`, `bg-bg` |
| Derived (new) | 6 | six inline `color-mix(…)`: four backgrounds (`web/src/styles/chats.css:24` row hover, `:36` pinned-row hover, `:45` pinned current row; `web/src/styles/layout.css:250` button hover) and two shadows (`web/src/thread/thread.css:164`, `web/src/push/notifications.css:47`) | `--color-row-hover`, `--color-row-pinned-hover`, `--color-row-pinned-current`, `--color-accent-press`, and two `--shadow-*` (names to settle in step 2) | `bg-row-hover`, `shadow-thumb` |
| Font (21-23) | 3 | `--font-title`, `--font-body`, `--font-mono` | `--font-title`, `-body`, `-mono`; Tailwind's `--font-*` cleared first | `font-title`, `font-body` |
| Spacing (25-30) | 6 | `--space-1` … `--space-6` = 4, 8, 12, 16, 24, 32 px | **none**: Tailwind's own scale, `--spacing: 0.25rem`. `--space-1` is `1`, `-2` is `2`, `-3` is `3`, `-4` is `4`, **`-5` is `6`** and **`-6` is `8`**. | `p-4`, `gap-3` |
| Radii (32-35) | 4 | `--radius-sm`, `-md`, `-lg`, `-pill` = 6, 10, 14, 999 px | the same names | `rounded-md`, `rounded-pill` |
| Sizes (37-39) | 3 | `--list-width` (320 px), `--bar-height` (56 px), `--focus-ring` (a `2px solid var(--accent)` outline) | `--width-list`, `--height-bar`; the focus ring becomes one rule in `@layer base` | `w-list`, `min-h-bar` |

The six spacing steps cover the gaps and paddings; the other pixel values (44 and 22 px controls, the 56 px bar, 88, 84 and 72 px, `max-width`s of 340, 360, 560 and 640) become the scale where they are multiples of 4 (`size-11`, `h-14`, `w-22`) or arbitrary values where not (`size-5.5`, `max-w-[340px]`).

**Type sizes** are mapped in step 2, not copied from `tokens.css`, which has no type scale. The CSS uses 13 distinct sizes (13 px ×8, 12 px ×8, 14 px ×7, 16 px ×6, 22 px ×3, 18 px ×3, 15 px ×3, and six used once or twice). They become a named `--text-*` scale (decision 6), with Tailwind's default `--text-*` cleared so `text-sm` yields nothing.

The names that change are referenced in these places beyond the CSS files being deleted:

- the PWA manifest's `theme_color` and `background_color` in `web/vite.config.ts:76-77` and `<meta name="theme-color">` in `web/index.html:7` (raw hex, with a comment just above them naming `tokens.css`). The values don't change, the comment does; and `theme_color` stays the light accent, because a manifest has no dark variant.
- `web/src/thread/thread.css:164` and `web/src/push/notifications.css:47` reference `var(--ink)` inside `color-mix`.

### A trap measured on a scratch Tailwind build (2026-11-10)

A scratch `@theme` with a derived token (`--color-row-hover: color-mix(in srgb, var(--color-sunk) 60%, var(--color-surface))`) and a dark override of `--color-sunk` in `@layer base`:

- Tailwind 4.3.5 emits the derived token **twice**: first with the light colours **resolved to hex** (`color-mix(in srgb, #e8edeb 60%, #ffffff)`), then inside `@supports (color: color-mix(in lab, red, red))` with the live `var()`s. A browser that supports `color-mix` takes the second, and follows the dark override. One without it keeps the light fallback in dark. The same goes for a `--shadow-*` that mixes a token.
- Satchel already uses `color-mix(in srgb, …)` unguarded in the six places above, so a browser without it is already unsupported: nothing regresses. The acceptance below checks the dark pair of every derived token, so the screenshots, not this note, decide.
- A dark override in `@layer base` beats `@layer theme`'s `:root` (later layer), so the tokens switch with no `dark:` class. Confirmed in the scratch output.
- `--color-*: initial` removes Tailwind's palette (`bg-red-500` produced no CSS), while an uncleared namespace leaks (`text-sm` produced CSS until `--text-*` is cleared too).
- `data-checked:` produces `[data-checked]`, `hover:` produces `@media (hover: hover)`, and a custom `--breakpoint-wide: 900px` produces `@media (width >= 900px)`.

### Classes the code reads, not only the stylesheet

None. `grep -rn "querySelector\|classList\|getElementsByClassName" web/src` finds nothing, and the two test files that render markup (`web/src/auth/AuthGate.test.ts`, `web/src/settings/Notifications.test.ts`) assert text, roles and attributes, not class names. So no test needs rewriting, and nothing needs a "marker" class.

**Inline styles:** two, both fixed widths on the loading skeleton (`web/src/chats/ChatList.tsx:83, 84`: `width: 40%`, `55%`, `75%`). They become fraction-width utilities. They are not data-driven, so no exception is needed.

### Gotchas Tailwind brings to this app

- **Shorthand then longhand.** Eight rules set `padding-left` or `-right` to `max(var(--space-4), env(safe-area-inset-left, 0px))` after a `padding` shorthand (for example `web/src/styles/layout.css:62-64`, and `chats.css`, `settings.css` and `thread.css` twice each). Tailwind orders `p-*` before `pl-*`/`pr-*`, so the cascade holds; the arbitrary values are `pl-[max(--spacing(4),env(safe-area-inset-left,0px))]`. The `px-*` and `pt-*` mixes need a check on a notched phone viewport.
- **`hover:` is hover-capable only.** In Tailwind v4, `hover:` applies under `@media (hover: hover)`. The 9 `:hover` rules stop sticking after a tap on a phone. That is an expected difference to list.
- **The 900 px breakpoint.** Tailwind's `md:` is 768 px, not Satchel's 900. Define `--breakpoint-wide: 900px` in `@theme` and use `wide:` (decision 7).
- **Preflight against `base.css`.** Preflight resets margins, `list-style` and heading sizes. That is safe here: every heading sets its own size (`.bar__title`, `.card__title`, `.gate__title`), and the four `list-style: none` rules become redundant. `base.css` adds what preflight lacks and goes to `@layer base`: body type, link colour, `:focus-visible`, `-webkit-tap-highlight-color`, `-webkit-font-smoothing`, `text-rendering`, the heading family, the reduced-motion override.
- **Unlayered vendor CSS.** The only third-party CSS is the 11 `@fontsource` files, which hold `@font-face` only: no rule in them can outrank a layered utility. Import them in `index.css` before Tailwind's layers.
- **`tailwind-merge` doesn't know custom names.** `web/src/lib/cn.ts` uses `extendTailwindMerge` with `rounded-pill`, `w-list`, `h-bar` and the `font-title` family, and a test for exactly that case. With the named type scale, `cn("text-ink", "text-body")` must keep both, so `extendTailwindMerge` also lists the `text-*` size names.

## Owner decisions

1. **Token names** (Q17, decided 2026-11-10, technical call). Satchel's names, put in Tailwind's namespaces (`--surface` becomes `--color-surface`, used as `bg-surface`). The cost is `bg-bg` for the page background. Satchel keeps its names until its redesign (brief 05); only the small-tools family converges on `surface`, `ink`, `accent`, `line`, `danger`.
2. **Dark mode: a Light / Dark / System switch, light by default** (Q18, decided 2026-11-10, owner). A first visit shows the light theme, not the system's. Tailwind's `dark:` keys off a `data-theme` attribute through `@custom-variant dark`, not `prefers-color-scheme`. Satchel still switches its 11 colour tokens rather than writing `dark:` classes, so the dark values move from the `@media (prefers-color-scheme: dark)` block to `[data-theme="dark"]` in `@layer base`, and the variant is declared for any case a token can't cover. The choice is kept on the device in `localStorage`: Satchel keeps no per-device settings on the server, and a theme is a per-device preference. Step 6 builds it, and this revisits "Theme follows the system. No toggle in phase 1" in [wiki/design.md](../../wiki/design.md).
3. **Visual parity** (Q19, decided 2026-11-10, owner). Close enough: screenshots at 1280 and 390 px, in light, plus 899, 900 and 901 px for the breakpoint, show no visible change to layout or colour. A few pixels of drift in spacing or rounding needn't be fixed or listed. Dark is checked for unreadable text and for the derived tokens' dark pair, since dark was system-following and is now the switch's.
4. **Fonts on the first paint** (default, not a question). The 11 `@fontsource` imports move from `main.tsx` into `web/src/styles/index.css`, and nothing about when they load changes: they were already in the one CSS chunk.
5. **Tailwind's scale against Satchel's pixels** (Q44, decided 2026-11-10, technical call). `html` stays at the browser's default and `body` carries the 15 px, which is already the case, so Q44 needs no change here. `--spacing: 0.25rem` (Tailwind's own, 4 px), with the default colour, text, radius, shadow and font scales cleared, so only Satchel's tokens exist.
6. **Type sizes** (Q62, decided 2026-11-10, technical call). The 13 type sizes become a named scale in `@theme` (`--text-*`), not arbitrary `text-[13px]` values. Step 2 names each size by its role and lists the table (size, name, uses). Sizes within a pixel of one another may merge where the screenshots show no visible change (Q19); the rest stay exact. The default `--text-*` is cleared, so `text-sm` yields nothing.
7. **The 900 px breakpoint, two copies** (default). `--breakpoint-wide: 900px` in `index.css`, `WIDE_QUERY` left as the JS string, and a test that reads `index.css` and fails if the two numbers differ. The alternative is to drop the CSS copy: `settings.css:15` is the only CSS use, and a `wide:` variant could be replaced by a prop from `AppShell`. *Still a question for the owner.* Q62's "no `phone` variant, `max-sm:` is used" doesn't apply: Satchel's switch is at 900 px, not a phone edge.
8. **Preflight.** Default: Tailwind's preflight, with what `base.css` adds beyond it ported to `@layer base`. The fallback, if the native form controls or the safe-area padding shift: import Tailwind's `theme.css` and `utilities.css` without its preflight, and keep `base.css`'s resets.
9. **Motion** (rule 7). Default: parity. The switch's two transitions become `transition-[…] duration-150` under `motion-safe:`, and the global reduced-motion override (`base.css:71-77`) stays as the one `@layer base` rule that keeps `!important`, with its comment. No new enter or exit animations.
10. **Order** (Q20, decided 2026-11-10, technical call). Fifth, after the todo app, wicket, the-board and lantern. This brief doesn't depend on any other app's migration.
11. **Tests** (Q60 and Q62, decided 2026-11-10, technical calls). The wrappers' tests stay static-markup, since they hold no logic. Tests select by role, and `data-testid` only where no role fits.

## Files you OWN

- `web/src/**/*.css`: all ten go.
- `web/src/styles/index.css` and `web/src/lib/cn.ts`, new, with a `cn` test and the breakpoint test.
- The `className` values in `web/src/**/*.tsx`, and the two inline `style` props in `web/src/chats/ChatList.tsx`.
- The style and font imports in `web/src/main.tsx`.
- The dependencies:
  - `web/package.json`, all pinned: `tailwindcss` 4.3.5, `@tailwindcss/vite` 4.3.5 (peer `vite` `^5.2.0||^6||^7||^8`, against Satchel's 8.3.5), `clsx` 2.1.1, `tailwind-merge` 3.7.0;
  - the root devDependencies: `eslint-plugin-better-tailwindcss` 4.10.0 (peers `eslint` up to 10, `tailwindcss` `^4.1.17`);
  - `package-lock.json`.
- `web/vite.config.ts`: the plugin, and the comment above `theme_color` that names `tokens.css`.
- The theme switch (step 6): a theme module and its control in `web/src/settings/`, the theme script in `web/index.html`, and their tests.
- `eslint.config.js`: the `better-tailwindcss` block only, with `entryPoint: "web/src/styles/index.css"`.
- `scripts/conventions.json`: only if an exception is needed (none is expected).
- `.claude/rules/web.md`: the Tailwind lines.
- Corpus:
  - [wiki/decisions.md](../../wiki/decisions.md): the revisit below;
  - [wiki/design.md](../../wiki/design.md): the Tokens section (where tokens now live);
  - [wiki/status.md](../../wiki/status.md);
  - [log.md](../../log.md).

## Files you must NOT touch

- `server/`, `shared/`, `cli/`.
- Behaviour. That covers event handlers, the router, the live socket, polling, keyboard handling and the share flow (`web/src/share/`). A change that looks necessary for styling is a finding for the outcome note.
- The PWA: `web/src/sw.ts`, the manifest's contents and the share target. Only the comment in `vite.config.ts` changes.
- The wrappers' props in `web/src/components/ui/`. Brief 02 settled them.
- The 11 `@fontsource` packages' versions.

## What to do

Follow the skill's `migrating-from-plain-css.md`. One commit per numbered step; after each, `npm run check` and `npm run build` pass.

1. **Screenshots before.** Bring the app up the way [docs/images/shots.md](../../../docs/images/shots.md) does:
   - a scratch `DATA_DIR`;
   - a made-up owner made with `SEED_USERNAME`, `SEED_PASSWORD` and `SEED_ROLE=admin npm run seed -w @satchel/server`;
   - `docs/images/demo-seed.mjs` for the friends and messages;
   - `agent-browser` or Playwright with Chrome.

   Two additions:
   - **Freeze the clock** at one instant: the seed backdates messages relative to the day it runs, so times and day separators move otherwise.
   - **Copy the seeded data folder**, so the after pass starts from the same rows.

   Keep the images out of git. Take each state at 1280 × 800 and 390 × 844 (iPhone 14), each in light and dark (`prefers-color-scheme` emulation, which is what the app follows today), and the shell at 899, 900 and 901 px wide:

   | Area | States |
   |---|---|
   | Sign-in | the login page; a failed sign-in; "Ward is unreachable" and "session ended" notices; with "Sign in with Ward" (set `WARD_OIDC_ISSUER` to a dummy); the gate's Loading… and "Can’t reach Satchel" (stop the API) |
   | Chat list | the loading skeleton; populated with the pinned inbox, an unread badge, a group and a current (selected) row at 1280; the offline banner; the empty list |
   | Thread | bubbles with ticks (sent, seen), day separators; a sending bubble and a failed one; the "new messages" pill; the offline pill; the composer with the count over the limit; the Ideas inbox with a Claude reply |
   | New chat | the people list; no match; the group form with none, two and the maximum picked (`GROUP_MEMBERS_MAX`); the group error |
   | Settings | the account row; Sign-in methods (set a password, change a password, with an error, Ward linked, unlink confirm open); Connect Claude (no tokens, the show-once panel *with a made-up token*, a revoked row, the revoke confirm open); Notifications in each state you can reach (loading, ready off and on, blocked, iOS hints, unsupported, server off, check failed) |
   | Shell | the empty pane at 1280; the tab bar on a phone with a safe-area inset (emulate one); a keyboard focus ring; the share screen |

   Never capture Connect Claude right after "Create token" with a real token. Record the built CSS size, raw and gzip, and the JS size.
2. **Set up.**
   - Add the dependencies and `@tailwindcss/vite`, and register the plugin.
   - Write `web/src/styles/index.css`:
     - the 11 `@fontsource` imports first, then the layer order and `@import "tailwindcss"`;
     - `@theme` with the default colour, font, text, radius, shadow and breakpoint namespaces cleared, the 27 tokens mapped (spacing left to Tailwind), the derived tokens, the named type scale (decision 6), `--breakpoint-wide: 900px`;
     - `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));`;
     - the dark block in `@layer base`, under `[data-theme="dark"]`, with `color-scheme: dark` there.
   - Keep `tokens.css`, **as aliases only**, such as `--surface: var(--color-surface)`, so the files not yet migrated keep working.
   - Add `web/src/lib/cn.ts` and its tests (`cn("text-ink", "text-body")` keeps both; the breakpoint test of decision 7).
   - Import `index.css` from `main.tsx` in place of the font and token imports.
3. **Migrate one stylesheet at a time**, in this order, deleting each when it is empty:
   1. `web/src/styles/base.css`: preflight plus `@layer base` (decision 8). `.visually-hidden` becomes `sr-only`.
   2. `web/src/styles/layout.css`, with `web/src/layout/*` and the shared pieces: buttons as one `buttonClass()` helper (`.button`, quiet, danger), `.card`, `.muted`, the bar, tab bar, avatar, gate, app mark. This goes first among the rest because every other file's buttons and cards are these.
   3. `web/src/styles/chats.css`, with the derived tokens it needs.
   4. `web/src/thread/thread.css`: the `.bubble--mine .tick` rules become variants on `Tick` (a prop or `group-*`); the composer.
   5. `web/src/people/people.css`: move the shared `.field*` rules next to `LoginPage`'s into one `Field` set of classes, and put `.icon-button--end` with the icon button. The checkbox goes into `web/src/components/ui/Checkbox.tsx` with `data-checked:`.
   6. `web/src/auth/auth.css`, `web/src/styles/settings.css`, `web/src/settings/connect-claude.css`.
   7. `web/src/push/notifications.css`, with `web/src/components/ui/Switch.tsx` (`data-checked:`, `data-disabled:`, `motion-safe:`).
   8. `web/src/styles/tokens.css`, the aliases: delete it once nothing reads an old name (`grep -rn "var(--" web/src` shows only `--color-*`, `--font-*`, `--radius-*`, `--width-*`, `--height-*` and Tailwind's own).
4. **Lint.** Turn on `better-tailwindcss`'s correctness rules and its class order as errors, and fix what they find.
5. **Screenshots after.**
   - Take the same states again from the copied data folder and the same frozen clock.
   - Compare each pair with Playwright's comparison or pixelmatch.
   - Fix any difference a person would see in layout or colour (decision 3). Drift of a few pixels needn't be fixed or listed.
   - Expected: hover not sticking after a tap on a phone. Record the CSS and JS sizes.
   - Check each derived token's dark screenshot (the trap above), and the notched-phone padding.
6. **The theme switch** (decision 2), in its own commit after the screenshots:
   1. A theme module reads the stored choice (`light`, `dark` or `system`, in `localStorage` inside a `try`, since storage can be blocked) and sets `data-theme` on `<html>`.
   2. A small inline script in `web/index.html`'s `<head>` does the same before first paint: the stored choice, else `light`. With `system` it follows `prefers-color-scheme` and listens for changes. The `color-scheme` meta and `theme-color` follow the theme. The manifest's `theme_color` stays the light accent, as it has no dark variant.
   3. A Light / Dark / System control on the Settings page, on a Base UI `RadioGroup` wrapper in `web/src/components/ui/` (a small addition to brief 02's set). Tests select it by role.
   4. Tests: each stored value maps to the attribute; `system` follows a changed media query.
7. **Corpus.**
   - In [wiki/decisions.md](../../wiki/decisions.md), revisit **"Base UI for interactive controls, styled by our own CSS"**, by heading, with a dated line and a `log.md` entry: it says "styled by our own CSS" and rejects "a styled kit such as shadcn, which would bring Tailwind". The first half changes: Base UI is now styled with Tailwind, by the owner's call of 2026-11-09. shadcn stays rejected for a reason of its own to record: Base UI is used directly, with no styled kit on top. "New interactive widgets start from Base UI" stands. Rename the heading to match. This entry grew a line in brief 02 and must still fit the page (see brief 01's note on [wiki/decisions.md](../../wiki/decisions.md)).
   - Update [wiki/design.md](../../wiki/design.md): the Tokens section (the tokens live in `@theme` in `web/src/styles/index.css`, dark by switching them under `data-theme`; the values table stays, with the type scale added), and the line "Theme follows the system. No toggle in phase 1" (now a Light / Dark / System switch, light on a first visit).
   - Update [wiki/status.md](../../wiki/status.md) and [log.md](../../log.md).
   - Add to `.claude/rules/web.md`:
     - tokens only from `@theme`;
     - no arbitrary colours;
     - dark by switching tokens under `data-theme`; `dark:` only where a token can't cover it;
     - type sizes from the named scale, no `text-[13px]`;
     - the `wide:` breakpoint and its test.
   - Run `bash corpus/lint.sh --index`, then `bash corpus/lint.sh`, until it is clean.
8. **The gate.** Drop `check-base-ui`'s `--warn-only` from `check:conventions`.

## Acceptance

- [ ] `find web/src -name '*.css'` prints only `web/src/styles/index.css`, and it holds the 11 font imports. `grep -n "\.css" web/src/main.tsx` shows only that file.
- [ ] `check-base-ui` passes **strict**, with nothing in `scripts/conventions.json` unless it carries a reason.
- [ ] `grep -rnE "(bg|text|border|fill|stroke|ring|outline|shadow)-\[(#|rgb|hsl)" web/src` prints nothing, and so does `grep -rn "style={" web/src`.
- [ ] `index.css`'s `@theme` defines exactly the mapped tokens. The default colour, text, radius and shadow scales are cleared: `bg-red-500` or `text-sm` in a component produces no CSS (checked with a throwaway class on a scratch build).
- [ ] `grep -rn "text-\[" web/src` prints nothing: every size is named. A `cn` test proves `cn("text-ink", "text-body")` keeps both classes, and the breakpoint test proves `--breakpoint-wide` equals `WIDE_QUERY`.
- [ ] The switch has three choices. A first visit with no stored choice is light even when the system is dark; "Dark" and "System" (with a dark system) set `data-theme="dark"` before first paint, with no flash; the choice survives a reload. A Playwright test covers all three, and dark screenshots of each main screen show no unreadable text and the right derived-token colours. `grep -rn "prefers-color-scheme" web/src` finds only the "System" code and the theme script.
- [ ] The light screenshot pairs at 1280 and 390 px, and at 899, 900 and 901 px, show no visible change to layout or colour, and the before and after CSS and JS sizes are in the outcome note.
- [ ] `npm run check` (with `better-tailwindcss`) and `npm run build` pass; the 577 tests (and the new ones) pass; `npm run build -w @satchel/web` still reports a service worker with a precache.
- [ ] The "Base UI for interactive controls" decision is revisited in [wiki/decisions.md](../../wiki/decisions.md), the design page's "no toggle in phase 1" line is revisited, and both have a `log.md` entry. `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 02's two wrappers are styled here like any other part; its renamed `.switch*` and `.person__check*` rules are deleted.
- Brief 05 (the redesign) builds on this brief's tokens, the type scale and the theme switch.
- Brief 04 doesn't touch `web/`. If both are open at once, they conflict only in `package-lock.json`, so don't run them at the same time.
- The service worker precaches `**/*.css`, so the new CSS file's hash changes the precache list. That is expected, and the next deploy updates installed copies through the worker's prompt flow ([wiki/design.md](../../wiki/design.md), PWA).

## Outcome (2026-11-11)

Done in five commits, not one per step: the stylesheets were migrated together because the shared pieces (Button, Card, Gate, the screen and field strings) cross every file. Board down: no (used). Light screenshots at 1280, 390, 899, 900 and 901 match; dark matches under the new switch. The comparison found one bug (shadowed `bubble` name), fixed. A Playwright script (scratch, not committed: the repo has no Playwright suite) checked the three theme choices, the first visit, no flash with the module blocked, and a reload. Sizes: CSS 20.2 to 27.1 kB, JS 370.9 to 422.7 kB, precache 531 to 589 KiB. Open from the brief: decision 7 (keep the CSS copy of 900 px) stands as the default and is still a question for the owner. The System choice sets `data-theme="system"` (the skill's way), not `dark`.

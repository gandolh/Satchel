---
paths:
  - "web/src/**"
---

# The web app (`web/src`)

- Read the `base-ui` skill before you add or change a component, and
  [corpus/wiki/design.md](../../corpus/wiki/design.md) for UI work.
- Base UI is imported only by the wrappers in `web/src/components/ui/`, from
  subpaths. Screens import the wrapper, never `@base-ui/react`. (Until that
  folder exists, `check-base-ui` reports the two direct imports as warnings.)
- Styling is Tailwind 4 utilities. The one stylesheet is
  `web/src/styles/index.css`; no other `.css`, no inline `style`.
- Tokens come from `@theme` there, never arbitrary: `bg-surface`, `text-muted`.
  No hex, `rgb()`, `color-mix()` or `bg-[#…]` in a component.
- Type sizes come from the named scale (`text-body`, `text-meta`, ...), never
  `text-[13px]`. A new token's name also goes into the lists in
  `web/src/lib/cn.ts`, or `cn()` drops classes it reads as clashing.
- Dark is the same tokens switched, under `data-theme` on `<html>`
  (`light-dark()` plus `color-scheme`); `dark:` only where a token can't cover
  it. The app has a Light / Dark / System switch (`settings/theme.ts`) and
  opens light on a first visit. `prefers-color-scheme` appears only in the
  "System" code and the boot script in `index.html`.
- The 900 px breakpoint is `WIDE_QUERY` in `web/src/polling.ts` and the
  stylesheet's `--breakpoint-wide` (the `wide:` variant). A test keeps the two
  equal.
- `hover:` applies only where the device can hover; never hide a control behind it.
- Fonts are self-hosted, never Google at runtime.
- The service worker (`web/src/sw.ts`) caches the app shell only, never the API.
- UI copy uses the words in
  [corpus/wiki/glossary.md](../../corpus/wiki/glossary.md).
- Static-markup tests assert roles and text, not class names.
- `web/vendor/` is Ward's generated client. Never edit it.
- `npm run check:conventions` runs `check-base-ui` over this folder, strict.

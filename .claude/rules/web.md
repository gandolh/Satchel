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
- Colours are tokens only: the custom properties in `web/src/styles/tokens.css`.
  No hex, `rgb()` or named colour in a component.
- The app has a Light / Dark / System switch and opens light on a first visit.
  Until it is built, dark follows the system (`prefers-color-scheme`).
- The 900 px breakpoint is `WIDE_QUERY` in `web/src/polling.ts` and the CSS's
  `wide:` variant. Keep the two in step.
- Fonts are self-hosted, never Google at runtime.
- The service worker (`web/src/sw.ts`) caches the app shell only, never the API.
- UI copy uses the words in
  [corpus/wiki/glossary.md](../../corpus/wiki/glossary.md).
- Static-markup tests assert roles and text, not class names.
- `web/vendor/` is Ward's generated client. Never edit it.
- `npm run check:conventions` runs `check-base-ui` over this folder,
  `--warn-only` until the Base UI and Tailwind briefs are done.

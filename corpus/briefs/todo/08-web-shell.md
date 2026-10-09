# Task 08: Web shell: sign-in, layout, chat list, PWA

## Context

The web app's frame: Ward sign-in and renewal, the typed API client, the
chat list, Settings with Sign out, the responsive layout, and the
installable PWA. Brief 09 fills in the thread view and Connect Claude on top
of it.

Read [design.md](../../wiki/design.md) first: a conventional messenger, its
screens, tokens, type and PWA rules. The browser side of Ward is in the Auth
section of [architecture.md](../../wiki/architecture.md). atrium already does
this: `../atrium/apps/web/src/lib/ward.ts` (`goToWardLogin`),
`../atrium/apps/web/src/lib/auth.ts` and
`../atrium/apps/web/src/auth/AuthGate.tsx`. Ward's own renewal logic is in
`../wzd_auth/ui/src/lib/session.ts`.

This brief runs after brief 05, so `/api/me` and `/api/conversations`
exist for the browser checks, and in parallel with brief 07 (CLI only).

## Files you OWN

```
web/package.json  web/vite.config.ts  web/index.html  web/public/*
web/src/main.tsx  web/src/App.tsx  web/src/router.ts  web/src/api.ts
web/src/ward.ts  web/src/auth/*  web/src/layout/*  web/src/chats/*
web/src/settings/Settings.tsx  web/src/styles/*  web/src/fonts/*
web/src/thread/ThreadPlaceholder.tsx  web/src/*.test.ts
```

## Files you must NOT touch

`shared/`, `server/`, `cli/`, `corpus/`. Leave `web/src/thread/` (except the
placeholder) and `web/src/settings/ConnectClaude.tsx` to brief 09.

## What to do

1. **API client** (`api.ts`). One typed function per phase-1 route in
   `shared/src/api.ts`, all under `/satchel-api`, parsing responses with the
   shared schemas. `credentials: "same-origin"`. On a 401: call
   `POST /ward-api/refresh` once (concurrent 401s share one refresh), then
   retry the request once; if refresh fails, go to Ward login. A 403 raises a
   `NoAccess` error; a 503 raises `Unavailable`.
2. **Ward** (`ward.ts`). `goToWardLogin()` sends the browser to
   `/ward/login?next=<path>`, where `next` is the current path under
   `/satchel/` (a bare path; Ward refuses absolute URLs). `refresh()` and
   `signOut()` (`POST /ward-api/refresh/logout`, then to Ward login). While
   the page is visible, renew every 12 minutes so the 15-minute access token
   doesn't lapse mid-typing.
3. **Auth gate.** On load, `GET /api/me`. Signed in → the app. 403 → a
   screen: "Your account doesn't have access to Satchel. Ask the owner to
   add you." with Sign out. 503 → "Satchel can't reach sign-in right now."
   with Retry.
4. **Router** (`router.ts`), no library: `/satchel/` (chats),
   `/satchel/c/:id` (thread), `/satchel/settings`, using the History API and
   `import.meta.env.BASE_URL`. Unknown paths go to chats.
5. **Layout.** Phone: one view at a time with a back arrow. From 900px: the
   chat list in a 320px column and the thread or settings beside it.
6. **Chat list** (`chats/`). `GET /api/conversations`, polled every 10
   seconds while the page is visible and at once when it becomes visible
   again. Rows as design.md describes; the inbox titled "Claude" with
   subtitle "Ideas inbox", Claude's avatar, pinned first. Empty and error
   states in plain words.
7. **Settings.** Display name, Sign out, and a slot where brief 09 mounts
   Connect Claude.
8. **Styles.** The tokens from design.md as CSS custom properties, light and
   dark through `prefers-color-scheme`. Fonts self-hosted (fontsource
   packages, or woff2 files in `web/src/fonts/`), never loaded from Google
   at runtime.
9. **PWA.** vite-plugin-pwa (atrium pins 1.3.0; use it if it supports Vite
   8, otherwise the newest release at least two weeks old). Manifest per
   design.md, with scope and start URL from `SATCHEL_BASE`. Icons at 192 and
   512 px plus an `apple-touch-icon`: an accent-coloured square with a white
   "S" in Familjen Grotesk, generated once and committed as PNGs. The service
   worker precaches the app shell and never caches `/satchel-api` or Ward
   responses.

## Acceptance

- Unit tests (Vitest, node environment) cover: one refresh for several
  concurrent 401s; retry after refresh; login redirect when refresh fails;
  `next` is always a bare `/satchel/...` path; router matching.
- In a browser against the local Ward container and `npm run dev`
  (credentials from `~/.config/ward/local.env`, never written into the
  repo): signing in lands on the chat list with the Claude inbox pinned;
  Sign out returns to Ward's login; an account without a Satchel grant sees
  the no-access screen. Check phone width (390px) and desktop (1280px), light
  and dark.
- `npm run build` produces a manifest and service worker; Lighthouse or
  Chrome's Application panel reports the app as installable.
- `npm run typecheck && npm run lint && npm test` pass.

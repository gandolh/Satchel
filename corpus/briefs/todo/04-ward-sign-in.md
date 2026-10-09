# Task 04: Ward sign-in on the server

## Context

Every `/api/*` route except `/api/health` needs a signed-in Ward account with
a Satchel grant. Ward's integration contract is
`../wzd_auth/corpus/wiki/integrating.md`. Read all of it before starting: its
"five things that must be right" are not optional, and it says which files
of the reference client to copy unchanged. atrium's
`../atrium/apps/api/src/modules/ward/` is a working integration to compare
against. The summary for this repo is the Auth section of
[architecture.md](../../wiki/architecture.md).

This brief also grows `buildApp` so briefs 05 and 06 can fill in their routes
in parallel without touching `app.ts`, and registers Satchel with the local
Ward container so sign-in works in dev.

## Files you OWN

```
server/src/app.ts  server/src/index.ts  server/src/config.ts
server/src/ward/*  server/src/routes/me.ts
server/src/routes/conversations.ts  server/src/routes/claude.ts  server/src/routes/tokens.ts
server/src/*.test.ts that test the above
```

In other repos, one entry each:

```
../wzd_auth/infrastructure/local/seed.mjs   (APPS)
../wzd_auth/ui/src/lib/estate.ts            (ESTATE_APPS)
```

## Files you must NOT touch

`shared/`, `web/`, `cli/`, `corpus/`, `server/src/store.ts` and
`server/src/db/` (brief 03). In `wzd_auth`, nothing but the two entries above.

## What to do

1. **Copy the Ward client.** Copy `claims.ts`, `verify.ts`, `introspect.ts`
   and `client.ts` from `../wzd_auth/client/src/` into `server/src/ward/`
   unchanged, as integrating.md says, plus `server/src/ward/testing/fakeWard.ts` for tests.
   Note the source commit in a comment at the top of each copied file.
2. **The guard** (`server/src/ward/guard.ts`), your own code: an `onRequest` hook on
   `/api/*` except `/api/health`. Read the `ward_session` cookie, verify, and
   introspect. Then:
   - no cookie, invalid or expired token, `active: false` → 401
     `unauthorized`;
   - active but `grants.satchel` missing or empty → 403 `forbidden`;
   - Ward unreachable, timeout, a 5xx, a body that doesn't match, or a JWKS
     failure → 503 `unavailable`. A 401 from introspection means the app key
     is wrong; log an error naming `WARD_APP_KEY` and answer 503.
   On success, put `{ subject, username }` on the request, call
   `store.upsertAccount(subject, username)` and `store.ensureInbox(subject)`.
3. **Config** (`config.ts`). Parse and validate `HOST`, `PORT` (8807),
   `DATA_DIR` (`./data`), `WARD_PUBLIC_ORIGIN`, `WARD_API_BASE_PATH`
   (`/ward-api`) and `WARD_APP_KEY` with zod at startup. A missing Ward value
   stops the server with a message saying which key and that Ward's local
   `seed.mjs` writes it.
4. **`buildApp({ store, ward, clock })`** in `app.ts`. Registers the guard,
   `GET /api/health`, `server/src/routes/me.ts`, and three route plugins that you create
   as empty stubs: `server/src/routes/conversations.ts` (brief 05), `server/src/routes/claude.ts`
   and `server/src/routes/tokens.ts` (brief 06). Maps errors to the shared error shape.
   Request bodies above 64 KB are rejected. `index.ts` opens the database
   from brief 03 and starts the app.
5. **`GET /api/me`** → `{ subject, displayName, inboxId }`.
6. **Local Ward.** Add `{ slug: "satchel", name: "Satchel", repo: "satchel",
   envFiles: [".env"] }` to `APPS` in seed.mjs and `{ slug: "satchel", root:
   "satchel", name: "Satchel" }` to `ESTATE_APPS` in estate.ts, matching the
   neighbouring entries. First run `git status` in `../wzd_auth`; if either
   file has uncommitted changes, stop and tell the owner. Rebuild the local
   Ward container (`docker compose up -d --build` in
   `../wzd_auth/infrastructure/local`) and run the seed, so this repo's
   `.env` gets the Ward trio. Commit the two `wzd_auth` lines as their own
   commit in that repo.

## Acceptance

- Tests with `fakeWard` cover: no cookie → 401; expired token → 401; a valid
  session **without** a Satchel grant → 403 (integrating.md requires this
  test); a valid session with a grant → 200 on `/api/me` with the inbox id,
  and the account and inbox exist afterwards; Ward unreachable → 503, not
  401; `/api/health` needs no cookie; the JWT is verified with `EdDSA` only.
- With the local Ward container up and `npm run dev` running, signing in at
  `http://localhost:5175/ward/login?next=/satchel/` and then requesting
  `http://localhost:5175/satchel-api/api/me` in the same browser returns the
  owner's subject. Brief 01's Vite config already proxies `/ward`.
- `npm run typecheck && npm run lint && npm test` pass.

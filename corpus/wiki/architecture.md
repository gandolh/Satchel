---
summary: How Satchel is put together. Briefs 01 to 04 are built (2026-10-09); the rest is as designed. Four npm workspaces; the API in a Docker container behind Caddy's handle_path at /satchel-api; the PWA at /satchel; Ward sign-in (cookie, local verify, introspection, satchel grant); the Claude routes behind a bearer token; ports, data directory, local dev wiring and the cross-repo changes in wzd_auth and vps-deploy.
updated: 2026-10-09
---

# Architecture

Built through brief 04 on 2026-10-09; the rest is planned. Verify against the
code before relying on a detail.

## Pieces

npm workspaces, as in the-board:

- `shared`: zod schemas for every route, the limits, and the seen rules
  (`nextSeenUpTo`, `tickState`, `seenLine`). Used by the other three.
- `server`: Fastify with better-sqlite3. Owns the store (the only module that
  runs SQL), the Ward guard, and the `/api/*` and `/claude/*` routes.
- `web`: Vite + React PWA. Talks only to `/satchel-api/api/*` and Ward.
- `cli`: the `satchel` command. Talks only to `/satchel-api/claude/*`.

## Request paths

```
phone ──https──► Caddy gandolh.ro
                 ├─ /satchel/*        static PWA (try_files spa)
                 ├─ /satchel-api/*    handle_path → container on 127.0.0.1:8795
                 └─ /ward, /ward-api  Ward
satchel CLI ──https + bearer──► /satchel-api/claude/*
```

`handle_path` strips `/satchel-api`, so the server's own routes are
`/api/...` and `/claude/...`. The Vite dev server strips it the same way.

## Auth

Two doors, never mixed:

- **`/api/*` (except `/api/health`)**: the Ward guard. It reads the
  `ward_session` cookie (`Path=/`, so the browser sends it on the shared
  origin), verifies the JWT locally against Ward's JWKS (EdDSA pinned,
  `aud = "ward-estate"`, `iss = WARD_PUBLIC_ORIGIN`), then introspects it at
  `/ward-api/introspect` with the `x-ward-app-key` header, cached 30 seconds
  per token. The answer carries `subject`, `username` and `grants`; a session
  without `grants.satchel` is a 403. Ward unreachable, a bad body or a JWKS
  failure is a 503: fail closed, never "signed out". The client is copied
  byte-identical from `../wzd_auth/client/src` into
  [server/src/ward/](../../server/src/ward/), as its `integrating.md`
  instructs; the guard is one root `onRequest` hook in
  [server/src/ward/guard.ts](../../server/src/ward/guard.ts). Errors leave
  through [server/src/errors.ts](../../server/src/errors.ts) in the shared
  shape; anything unexpected is a 500 `internal` with no details.
- **`/claude/*`**: the Claude token as a bearer header, resolved by hash. No
  cookie is read and no Ward call is made.

A Claude token on `/api/*` is a 401, and a Ward cookie on `/claude/*` is a
401. Tests assert both.

The browser renews the 15-minute access token with `POST /ward-api/refresh`
(same origin) on a 401, retries once, and sends the owner to
`/ward/login?next=/satchel/` if renewal fails.

## Accounts

`accounts.subject` is Ward's opaque subject; `display_name` is the Ward
username from introspection, refreshed on every authenticated request. The
guard also makes sure the account has its Ideas inbox.

## Data

One SQLite file, `$DATA_DIR/satchel.db`. In the container `DATA_DIR=/data`,
bind-mounted from `/srv/satchel-api/data` on the VPS. Schema and the
append-only triggers: [messages-and-seen.md](messages-and-seen.md) and brief
03. Updates reach the web app by polling in phase 1 and over a WebSocket at
`/api/live` in phase 2.

## Ports

| Where | What | Port |
|---|---|---|
| local | API (`npm run dev`) | 8807 |
| local | Vite dev server, serving `/satchel/` | 5175 |
| local | Ward container | 8792 |
| VPS | container, published on loopback only | 8795 |

8806 is the-board; 8787 to 8794 and 8080 are other stacks.

## Local development

The Vite dev server serves the app at `http://localhost:5175/satchel/` and
proxies `/satchel-api` to the API (prefix stripped) and `/ward` and
`/ward-api` to the local Ward container, rewriting `Origin` the way atrium's
`vite.config.ts` does, because Ward's `/refresh` and `/logout` check it. The
API reads the Ward trio (`WARD_PUBLIC_ORIGIN`, `WARD_API_BASE_PATH`,
`WARD_APP_KEY`, all required) from the gitignored `.env` that Ward's
`seed.mjs` writes. A relative `DATA_DIR` resolves against the repo root, so
local data is `data/satchel.db`.

## Changes in other repos

- `wzd_auth`: Satchel added to `APPS` in
  `../wzd_auth/infrastructure/local/seed.mjs` and to `ESTATE_APPS` in
  `../wzd_auth/ui/src/lib/estate.ts` (brief 04). Production
  registration, the service key and the owner's grant are done by hand in
  Ward's console (brief 10).
- `vps-deploy`: a `SourceRepo` in `../vps-deploy/lib/estate.ts`,
  `../vps-deploy/stacks/satchel.ts` modelled on
  `../vps-deploy/stacks/sports-app.ts`, the stack and `useWard` in its
  `app.ts`, and the regenerated Caddyfile (brief 10). The key goes in
  `../vps-deploy/secrets/satchel.env`, which only the owner writes.

## Deploy

The repo carries `infrastructure/Dockerfile` (multi-stage, node:24-alpine,
modelled on Ward's because both build better-sqlite3) and
`infrastructure/docker-compose.yml` (modelled on sports-app's: loopback port,
`env_file: .env`, `/data` bind mount, healthcheck on `/api/health`). vps-deploy
builds the image on the box. Deploying is an owner step:
`node cli.ts satchel all` the first time, then `deploy` for the client and
`server` for the container.

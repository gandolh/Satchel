---
summary: How Satchel is put together, as built on 2026-10-09 (all 14 briefs) and re-based on local accounts on 2026-10-13 (brief 26). Workspaces, request paths, the session guard (the vendored ward-auth plugin plus Satchel's own half), "Sign in with Ward", the live socket's session re-check, the Claude bearer door, ports, data, local dev, the cross-repo changes and the deploy. Four npm workspaces; the PWA at the root of its own host, satchel.<domain>, and the API in a Docker container behind Caddy's handle_path at /satchel-api on that host (since 2026-10-22, brief 15; /satchel in local dev); local accounts and sessions with Ward as a linked second way in; the Claude routes behind a bearer token.
updated: 2026-10-13
---

# Architecture

Built on 2026-10-09 by briefs 01 to 14 and two review rounds; the sign-in half
was replaced on 2026-10-13 by brief 26. Verify against the code before relying
on a detail.

## Pieces

npm workspaces, as in the-board:

- `shared`: zod schemas for every route, the limits, and the seen rules
  (`nextSeenUpTo`, `tickState`, `seenLine`). Used by the other three.
- `server`: Fastify with better-sqlite3. Owns the store (the only module that
  runs SQL, apart from the vendored auth library's own tables), the session
  guard, and the `/api/*`, `/auth/*` and `/claude/*` routes.
- `web`: Vite + React PWA. Talks only to `/satchel-api/*`; Ward is reached by
  the browser only through the "Sign in with Ward" redirect.
- `cli`: the `satchel` command. Talks only to `/satchel-api/claude/*`.

## Request paths

```
phone ──https──► Caddy, satchel.<domain>
                 ├─ /satchel-api/*    handle_path → container on 127.0.0.1:8795
                 └─ /*                static PWA (try_files spa)
       ──https──► Caddy, ward.<domain> (only the "Sign in with Ward" round trip)
satchel CLI ──https + bearer──► satchel.<domain>/satchel-api/claude/*
```

`handle_path` strips `/satchel-api`, so the server's own routes are
`/api/...` and `/claude/...`. The Vite dev server strips it the same way. The
host is Satchel's alone since 2026-10-22 ([decisions.md](decisions.md)); the
app is the same build, made with `SATCHEL_BASE=/`.

## Auth

Two doors, never mixed:

- **`/api/*` (except `/api/health`) and `/auth/*`**: the vendored `ward-auth`
  plugin ([server/vendor/ward/](../../server/vendor/ward/), version 0.2.0,
  never edited), registered first in
  [server/src/app.ts](../../server/src/app.ts) as the root guard. It owns
  local sign-in (`POST /auth/login`, `/auth/logout`, `GET /auth/session`,
  password change), the Ward routes (`POST /auth/ward/start`, `GET
  /auth/ward/callback`, link, unlink, set a password, "sign out of Ward too")
  and the opaque session in the `satchel_session` cookie
  (`Path=/satchel-api`, so it rides the WebSocket upgrade too). A request
  without a live session is `401 { error: "unauthorized" }`, the plugin's
  shape, not the `{ error: { code, message } }` of the rest. The routes are
  public by an allowlist: `GET /api/health`, and `/claude/*` (judged by route
  pattern). [server/src/auth/guard.ts](../../server/src/auth/guard.ts) is
  Satchel's half, a hook that runs after the plugin on `/api/*`: it refuses a
  cross-origin write, upserts the `accounts` row (display name = username),
  reads the role from the user row, makes the owner's inbox and revokes the
  Claude tokens of a non-admin, and sets `request.account`. Errors leave
  through [server/src/errors.ts](../../server/src/errors.ts).
- **`/claude/*`**: the Claude token as a bearer header, resolved by hash. No
  cookie is read and no Ward call is made.

A Claude token on `/api/*` is a 401, and a session cookie on `/claude/*` is a
401. Tests assert both.

**Sign in with Ward** is an OpenID Connect code flow with PKCE that the server
finishes (`WARD_OIDC_ISSUER`, `WARD_OIDC_CLIENT_ID`, `WARD_OIDC_CLIENT_KEY`,
`WARD_OIDC_REDIRECT_URI`, `WARD_OIDC_POST_LOGOUT_REDIRECT_URI`; unset issuer
means local accounts only, and the button is hidden). The callback is
`<API prefix>/auth/ward/callback`, so the dev server and Caddy need no new
rule. A first Ward sign-in makes a local user (role from Ward's grant); a user
with an account links Ward in Settings; nothing is matched by username. A
session that began with Ward is checked against Ward at most every 30 seconds;
Ward not answering refuses it (`ward_unavailable`) and a local session is
never checked.

Two more guard rules:

- **Cross-site writes are refused.** A POST to `/api/*` is a 403 `forbidden`
  when the browser marks it cross-origin: an `Origin` that isn't
  `PUBLIC_ORIGIN`, or, with no `Origin`, a `Sec-Fetch-Site` other than
  `same-origin`. Requests with neither header pass, which covers tests and
  non-browser clients. The plugin applies its own `cross_site` rule to `/auth/*`.
- **An account without `admin`** loses its Claude tokens on every request,
  so a demoted owner keeps the inbox rows but not the tokens.

The 2026-10-09 lost-grant lockout is gone from the guard; see
[decisions.md](decisions.md).

The browser has nothing to renew: the session slides on use (14 days idle, 30
absolute). A request that comes back 401 tells the auth gate
([web/src/auth/AuthGate.tsx](../../web/src/auth/AuthGate.tsx)), which shows the
login page.

## Accounts

`accounts.subject` is the local user's id (`auth_users.id`); for an account
that predates local sign-in it is the old Ward subject, kept so no row moves
(boot-time [server/src/auth/migrate.ts](../../server/src/auth/migrate.ts)).
`display_name` is the username, refreshed on every authenticated request. The
guard also makes sure the owner has an Ideas inbox.

## Data

One SQLite file, `$DATA_DIR/satchel.db`. In the container `DATA_DIR=/data`,
bind-mounted from `/srv/satchel-api/data` on the VPS. Schema and the
append-only triggers: [messages-and-seen.md](messages-and-seen.md) and brief
03. Updates reach the web app over a WebSocket at `/api/live`
([server/src/live/](../../server/src/live/)). Polling remains the fallback
while the socket is down. The upgrade must carry Satchel's own `Origin` and passes
the session guard, and the open socket asks the guard again every 10 seconds
and closes with code 4001 when the session is over (why: [decisions.md](decisions.md)). Events
go only to a conversation's members, never to `claude`. An account may hold
ten sockets; an eleventh closes the oldest with 4002, and that tab then waits
to be shown again instead of reconnecting.

## Push

Web Push signed with a VAPID pair (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT`, from `.env` locally and `../vps-deploy/secrets/satchel.env`
in production). Without all three, the server starts with push off. Each
device's subscription is stored in `push_subs`. Every newly stored message
is pushed to the other members' devices after the reply, never to Claude,
never for the inbox. The service worker
([web/src/sw.ts](../../web/src/sw.ts)) shows one notification per chat and
skips it while that chat is focused. Code: [server/src/push/](../../server/src/push/).

## Ports

| Where | What | Port |
|---|---|---|
| local | API (`npm run dev`) | 8807 |
| local | Vite dev server, serving `/satchel/` | 5175 |
| local | `vite preview` of the built app, same proxy | 4175 |
| local | Ward container | 8792 |
| VPS | container, published on loopback only | 8795 |

8806 is the-board; 8787 to 8794 and 8080 are other stacks.

## Local development

The Vite dev server serves the app at `http://localhost:5175/satchel/` and
proxies `/satchel-api` to the API (prefix stripped), WebSocket included; it
passes `Origin` through untouched and has no Ward rule. The API reads the five
`WARD_OIDC_*` values from the gitignored `.env` that Ward's `seed.mjs` writes,
and takes `PUBLIC_ORIGIN` from the redirect URI's origin
(`http://localhost:5175`). Users come from `npm run seed -w @satchel/server`
(`SEED_USERNAME`, `SEED_PASSWORD`, `SEED_ROLE`). A relative `DATA_DIR` resolves
against the repo root, so local data is `data/satchel.db`.

## Changes in other repos

- `wzd_auth`: Satchel added to `APPS` in
  `../wzd_auth/infrastructure/local/seed.mjs` and to `ESTATE_APPS` in
  `../wzd_auth/ui/src/lib/estate.ts` (brief 04). Production
  registration, the service key and the owner's grant are done by hand in
  Ward's console (brief 10).
- `vps-deploy`: a `SourceRepo` in `../vps-deploy/lib/estate.ts`,
  `../vps-deploy/stacks/satchel.ts` modelled on
  `../vps-deploy/stacks/sports-app.ts`, the stack and `useWard` in its
  `app.ts`, and the regenerated Caddyfile (brief 10). The OIDC client
  key goes in `../vps-deploy/secrets/satchel.env`, which only the owner writes.

## Deploy

The repo carries `infrastructure/Dockerfile` (multi-stage, node:24-alpine,
modelled on Ward's because both build better-sqlite3) and
`infrastructure/docker-compose.yml` (modelled on sports-app's: loopback port,
`env_file: .env`, `/data` bind mount, healthcheck on `/api/health`). vps-deploy
builds the image on the box and builds the client with `SATCHEL_BASE=/` for
`satchel.<domain>` (its brief 16). Deploying is an owner step:
`node cli.ts satchel all` the first time, then `deploy` for the client and
`server` for the container.

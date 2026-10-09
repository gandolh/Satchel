# Getting started

Run Satchel on your own machine: the API, the web app and the `satchel` CLI.
Deploying is a separate, hand-run step in [owner-setup.md](owner-setup.md).

## Prerequisites

- Node 24 or later (`engines` in `package.json`) and npm.
- The local Ward container from the sibling `wzd_auth` repo
  (`wzd_auth/infrastructure/local`, see its README), answering on
  <http://localhost:8792>. Satchel signs everyone in through it.
- Ward's local seed (`node seed.mjs` in that folder) run at least once. It
  registers the `satchel` app, gives the owner account the `admin` role on it,
  and writes the three `WARD_` values into this repo's `.env`.

## Install

```bash
npm install
```

## Configure

Copy `.env.example` to `.env`, which git ignores. The server reads it at
start-up. The Vite dev server reads it too, for the API port and Ward's origin.

| Variable | Purpose | Where the value comes from |
|---|---|---|
| `HOST` | Address the API binds to | `127.0.0.1` |
| `PORT` | API port; the dev proxy follows it | `8807` |
| `DATA_DIR` | Folder for `satchel.db`. A relative path is taken from the repo root | `./data` |
| `WARD_PUBLIC_ORIGIN` | Ward's origin, also the issuer its tokens must carry | Ward's local seed |
| `WARD_API_BASE_PATH` | Ward's API path, `/ward-api` | Ward's local seed |
| `WARD_APP_KEY` | Satchel's service key for Ward introspection. A secret | Ward's local seed |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional. Push notifications; without all three, push is off | [owner-setup.md](owner-setup.md#push-notifications) |

The three `WARD_` values are required. Without them the server stops at
start-up and names the missing key.

## Run

```bash
npm run dev
```

This builds `shared`, then runs the API under `tsx watch` and the Vite dev
server side by side. Open <http://localhost:5175/satchel/> and sign in through Ward.

- The Vite dev server serves the app under `/satchel/` on port 5175, and stops
  if that port is taken.
- It proxies `/satchel-api` to the API with the prefix stripped, the way Caddy
  does in production, and `/ward` and `/ward-api` to Ward.
- An account with `admin` on `satchel` is the owner and gets the Ideas inbox
  and Connect Claude. An account with `member` gets friend chats only.

## Use the CLI against your local server

Build once, then create a token in the local app under Settings → Connect
Claude and pass it through the environment:

```bash
npm run build
read -rs -p 'Claude token: ' SATCHEL_TOKEN && export SATCHEL_TOKEN
export SATCHEL_URL=http://127.0.0.1:8807
node cli/dist/index.js unread
node cli/dist/index.js history --limit 3
```

The CLI sends the token over https only, or over http to a loopback address.
It reads `SATCHEL_URL` and `SATCHEL_TOKEN` from the environment first, then
from `~/.config/satchel/env`, which is where the production token lives.
Prefer the environment for a local token. The commands and their output are
described in [corpus/wiki/claude-access.md](../corpus/wiki/claude-access.md).

## Test, typecheck, lint, build

```bash
npm test            # vitest, every workspace
npm run typecheck
npm run lint
npm run build       # tsc for shared, server and cli, then the web app
```

## Run the API container

To run the API container locally, copy the Ward values from `.env` to
`infrastructure/.env` (git-ignored) and run
`docker compose -f infrastructure/docker-compose.yml up --build -d`; it listens
on `127.0.0.1:8795` and keeps its data in `./data`.

## Push notifications locally

`npm run dev` runs no service worker, so push can't be tried there. The steps
for the built app and `vite preview` on port 4175 are in
[owner-setup.md](owner-setup.md#push-notifications).

## Common problems

- **The server prints `Satchel cannot start:` and a `WARD_` key that is not
  set.** Run Ward's local seed; it writes the values into `.env`.
- **Port 5175 is in use.** The dev server won't pick another port. Stop
  whatever holds it.
- **Signed in, but the app shows "No access".** The Ward account has no role
  on `satchel`. Grant one in the local Ward console.

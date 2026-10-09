# Log

## [2026-10-09] decision | Design settled

Satchel is a text messenger whose pinned Ideas inbox is a chat with Claude,
plus one-to-one and group chats with friends. The owner chose the house stack
(Fastify + SQLite + React PWA behind Ward) over a Matrix homeserver and over
MLS encryption, cut media, tags and the offline outbox, and replaced the MCP
endpoint with a CLI in the-board's pattern. The one-call "read and mark read"
endpoint became two calls so no message can be lost. Recorded in
[wiki/decisions.md](wiki/decisions.md).

## [2026-10-09] maintenance | Corpus bootstrapped

Wiki spine (overview, architecture, decisions, glossary, status,
open-questions) plus concept pages for messages and seen, Claude access, and
design. `lint.sh` copied from the-board. Research on 2026-10-09 corrected one
assumption: vps-deploy runs every service as a rootless Docker container, not
under pm2, so brief 10 ships a Dockerfile and compose file.

## [2026-10-09] todo | Briefs 01 to 14 filed

Phase 1 (Ideas inbox): 01 to 10. Phase 2 (friends): 11 to 14. Waves in
[wiki/status.md](wiki/status.md). Not filed on the-board yet: the
`brief-board` CLI isn't on PATH, and its `sync` will pick these up once the
repo exists.

## [2026-10-09] maintenance | Repository wired

The owner's [gandolh/Satchel](https://github.com/gandolh/Satchel) (initial commit: Node `.gitignore`, MIT
`LICENSE`, one-line `README.md`) was cloned and its `.git` moved into this
directory, keeping `corpus/` in place. Brief 01 now extends those files
instead of checking for a repository.

## [2026-10-09] decision | The name stays Satchel

The owner named the GitHub repository Satchel, so the open question about
the name is closed. The CLI, paths, Ward app key and stack keep it.

## [2026-10-09] done | Briefs 01 to 04: scaffold, contract, storage, Ward sign-in

The backlog run started with plan-split-dispatch. Commits:

- 01 `1d23546`: workspaces;
- 02 `e6f15a7`: shared contract, 67 tests;
- 03 `a83dcc9`: SQLite store with append-only triggers;
- 04 `d1728de`: Ward guard and `/api/me`, 141 tests in all; wzd_auth
  `d85aeaa` registers Satchel locally.

The controller added `CLAUDE_DISPLAY_NAME` and an `internal` (500) error
code to the contract. Client-ID replays now also match on sender
([wiki/messages-and-seen.md](wiki/messages-and-seen.md)).

Brief 04's live check signed in through the dev proxy and got the owner's
subject. The-board's server was down, so no ticket moves were made. Outcome
notes are in each brief.

## [2026-10-09] done | Briefs 05 and 06: conversation and Claude routes

Run in parallel. Commits: 05 `91721cf` (list, read, idempotent send, mark
seen) and 06 `66e4655` (the `/claude/*` routes behind the bearer token,
plus token create, list and revoke). 186 tests. The server side of phase 1
is complete.

Before wave 6, the controller installed vite-plugin-pwa 1.3.0, workbox-window,
the fontsource families, and the CLI's dev link to the server (`992a2f2`), so
briefs 07 and 08 don't race on the lockfile. vite-plugin-pwa 2.0.0 was
skipped as under two weeks old.

## [2026-10-09] done | Briefs 07 and 08: the satchel CLI and the web shell

Run in parallel. Commits: 07 `be07955` (CLI and guide) and 08 `ba058e5`
(sign-in and renewal, router, layout, chat list, PWA). 245 tests.

- **Live checks.** Brief 08's browser checks ran against local Ward: sign-in,
  renewal, sign-out, no-access, installability.
- **Duplicate zod.** Brief 08 surfaced two zod copies; `3519545` pins 4.5.4
  tree-wide.
- **The owner said "commit freely".** From brief 07 on, a brief is committed
  as soon as its own gate passes, without waiting for its wave partner.

## [2026-10-09] done | Briefs 09 and 10: inbox thread, Connect Claude, deployable

Commits:

- 09 `9084340`: the thread with sending, retries, ticks and "Seen", plus
  Connect Claude;
- 10 `134de77` and vps-deploy `455682e`: Dockerfile, compose, the stack and
  the owner's setup steps.

255 tests. Brief 10 ran in parallel with 09, since their files were
disjoint. The controller fixed the README's CLI exit codes. Phase 1 is
built and waits on the owner's deploy steps.

## [2026-10-09] decision | The Ideas inbox is owner-only

Asked before brief 11, the owner chose owner-only: only accounts with the
`admin` role on Satchel get an inbox and may create Claude tokens. Recorded
in [wiki/decisions.md](wiki/decisions.md); brief 11 now implements it.

## [2026-10-09] maintenance | Phase-1 review and fixes

Three read-only finders reviewed `e02aeaf..HEAD`: security (opus), server and
storage (sonnet), web, CLI and docs (sonnet). None found anything critical.
They found only Minor issues; the controller promoted two to Important
(the CLI exit code when the container is down, and a possible sign-in
redirect loop). Fixed in two lane-disjoint batches:

- `17b1603`, CLI and web:
  - exit 3 for a stalled body and for 502/503/504;
  - inline config comments, and the token sent over https only;
  - no redirect after a refresh that still 401s;
  - a retry for a failed seen marker;
  - the README reads the token without echo.
- `d15dc90`, server:
  - cross-site writes refused;
  - tokens revoked when a grant is lost;
  - compose pins HOST, PORT and DATA_DIR;
  - startup failure handling;
  - the rollback test tightened. `app.ts` gained a `publicOrigin` dependency.

276 tests. The rules are in [wiki/architecture.md](wiki/architecture.md) and
[wiki/claude-access.md](wiki/claude-access.md).

Accepted and not fixed:

- Revoking on a lost grant is lazy.
- Ward's own same-origin check is stricter (it checks both headers whenever
  both are present); Satchel's is equivalent for real browsers.
- Something on the machine polls `127.0.0.1:8807/api/board`. It is not
  Satchel's.

## [2026-10-09] done | Brief 11: friends on the server

Commit `0a642f2`. Covers people, direct and group chats, migration 2, and the
owner-only Ideas inbox. The controller added token revocation for accounts
without `admin`. 339 tests. Brief 13 was amended with the no-access fix this
brief surfaced: only a 403 from `/api/me` locks the app.

## [2026-10-09] done | Brief 12: live updates over WebSocket

Commit `2879ee2`, 392 tests. One socket per tab, with origin-checked
upgrades and expiry at the token's `exp`; polling stays as the fallback.
The controller pinned `ws` 8.21.3. The lingering-socket concern is captured
as [todos/recheck-ward-session-on-socket-ping.md](todos/recheck-ward-session-on-socket-ping.md).

## [2026-10-09] done | Brief 13: friend chats in the web app

Commit `e388001`, 400 tests. Adds New chat, group threads and the no-access
fix. The controller moved New chat into `AppShell`'s main pane. Follow-up
captured: [todos/hide-ungranted-accounts-from-people.md](todos/hide-ungranted-accounts-from-people.md).

## [2026-10-09] done | Brief 14: push notifications; every brief is built

Satchel `35c53ea` and vps-deploy `fe6d6f3`, 497 tests. The controller
declared the workbox packages that `sw.ts` imports. A live round-trip
through Chrome's push service passed. All 14 briefs are done; a final
review of phase 2 is running.

## [2026-10-09] maintenance | Phase-2 review and fixes; the run is complete

Three finders reviewed `329d461..HEAD` (security on opus, server and web on
sonnet). They found nothing critical. Four findings were Important: a removed
friend kept getting push previews; a shared browser kept the previous
account's pushes; a socket that died during sleep looked live; and the new
socket cap could evict tabs in a loop. Fixed in:

- `3f89992`, web:
  - reconnect after five seconds away;
  - sign-out unsubscribes, and sign-in re-binds;
  - Enter in New chat no longer submits an empty group;
  - a retryable error for the notifications check.
- `8329a2c`, server:
  - lost-grant lockout with `accounts.active` (migration 4);
  - push subscriptions deleted and inactive accounts skipped;
  - at most ten sockets per account (close code 4002, and the client
    doesn't auto-reconnect after it);
  - trailing-dot push hosts refused;
  - the subscription cap on rebind;
  - `VAPID_SUBJECT` validation.

538 tests. The lockout resolved
`todos/hide-ungranted-accounts-from-people.md`, which was removed.

Accepted and not fixed:

- The lockout and socket expiry only happen at the person's next request
  (the socket re-check stays a todo).
- A Ward-disabled account is a 401, not a 403, so it stays listed.
- Safari may penalise pushes suppressed while a chat is focused.

Outside this run, commit `63fcf74` rewrote the README as a landing page and
moved the setup steps into `docs/` (`owner-setup.md`, `getting-started.md`,
`architecture.md`).

All 14 briefs are done. Nothing is deployed; the owner's steps are in
`docs/owner-setup.md`.

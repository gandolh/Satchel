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

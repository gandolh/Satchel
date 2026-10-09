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

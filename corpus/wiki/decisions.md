---
summary: Locked calls for Satchel, each with date, rejected alternatives and reason. Own app on the house stack; Claude reads through a CLI, not MCP; reading and marking seen are two calls; one forward-only seen marker per member; order from a server seq; messages are append-only; Claude's token is bound to the inbox; the inbox is owner-only; text only; inbox before friends; local accounts with Ward as a linked second way in; a live socket re-checks its session every 10 seconds. Read before proposing to change any of these.
updated: 2026-10-13
---

# Decisions

Each entry passed three tests: hard to reverse, surprising without context, and
a real trade-off. Changing one needs an explicit revisit and a `log.md` entry.

## Own app on the house stack
_2026-10-09_. A Fastify + better-sqlite3 API in a Docker container and a Vite +
React PWA, on the shared Caddy VPS through vps-deploy, signed in through Ward (since 2026-10-13: local accounts, with Ward as a linked second way in; see the end of this page). The owner chose it after
seeing three variants. Rejected: a Matrix homeserver (Tuwunel or Continuwuity)
with an own client, because the server and protocol would be borrowed, Ward
doesn't fit its login cleanly, and Claude would read through a bot or an MCP
server. Also rejected for now: end-to-end encryption with MLS (`ts-mls`),
because device management is most of the work and nothing needs it yet. The
data model keeps `text` in one column so friend chats could hold ciphertext
later without a rewrite.

## Claude reads through a CLI on PATH, not MCP
_2026-10-09_. Copied from the-board: a `satchel` CLI linked onto PATH, its
address and token in `~/.config/satchel/env`, and a `satchel guide` command
that prints the rules. One line in `~/.claude/CLAUDE.md` tells Claude to run
the guide. Rejected: an MCP server, which has to be registered everywhere (the
owner's call). Rejected: raw `curl`, which puts the token into commands and
transcripts. Rejected: WebFetch, which can't send the token and summarises
pages instead of returning them verbatim. See [claude-access.md](claude-access.md).

## Reading and marking seen are two calls
_2026-10-09_. `GET /claude/unread` changes nothing; `POST /claude/seen { upTo }`
moves the marker. The owner first asked for one endpoint that returns unread
messages and marks them read. Rejected, because a dropped response or an ended
session would mark messages seen that Claude never got, which is the loss the
owner wanted to avoid. `upTo` also keeps a message sent mid-read unread.

## One forward-only seen marker per member
_2026-10-09_. Each member of a conversation has one `seen_up_to` number.
Message N is seen by that member when N is at or below it. The marker never
moves backwards. Rejected: a seen flag per message per member, which costs a
row per message and allows holes. The marker gives WhatsApp's semantics
(seeing a message means seeing everything before it), group read receipts from
the same row, and matches Matrix read receipts. See
[messages-and-seen.md](messages-and-seen.md).

## Order comes from a server seq shared by all conversations
_2026-10-09_. Messages are ordered by `seq`, SQLite's `INTEGER PRIMARY KEY
AUTOINCREMENT`, plus the server's receive time in UTC. Rejected: the phone's
clock, which drifts and can't break same-millisecond ties. Rejected: a
counter per conversation, which needs its own bookkeeping and gives no single
cursor for catching up across all chats. The cost is gaps: an inbox can go
#41, #44 when friend messages land in between. Gaps are normal.

## Messages are append-only
_2026-10-09_. No editing and no deleting. A correction is a new message, and
the guide tells Claude that a later message wins over an earlier one. SQLite
triggers reject `UPDATE` and `DELETE` on `messages`, so the database enforces
it, not only the UI. Rejected: editing, which would let a seen message change
after Claude read it. The owner said no deleting "yet"; lifting it is a
revisit of this entry.

## Claude's token is bound to the inbox conversation
_2026-10-09_. A Claude token row stores its conversation. Every `/claude/*`
handler takes the conversation from the token and never from the request, so
no parameter can point Claude at a friend chat. The server keeps only a hash;
the token is shown once in Settings. Rejected: a general API token with
scopes, which would make "Claude never reads friend chats" depend on scope
checks in every handler.

## The Ideas inbox is owner-only
_2026-10-09_. Only an account whose Satchel grant includes the `admin` role
gets an Ideas inbox and may create Claude tokens. Friends see only their
chats with people. The owner chose this when asked before brief 11.
Rejected: an inbox for everyone (friends would see a pinned Claude chat
nobody reads), and an inbox that appears after Connect Claude (more
states, for friends nobody expects to use Claude Code). Opening it up later
is a revisit of this entry.

## Text only, no tags, no offline outbox
_2026-10-09_. The owner cut photos, voice, files, project tags and the
IndexedDB outbox from the first design. A failed send stays in the chat with
Retry, and the client ID makes the retry safe. Rejected for now: media, which
needs storage, size limits and authenticated serving; an outbox, which is
machinery a Retry button covers.

## Ideas inbox first, friends second
_2026-10-09_. Phase 1 ships only the inbox and the Claude path; friend chats,
live updates and push are phase 2. Rejected: both at once. The inbox is
useful on day one and has no other users to support.

## Satchel has its own accounts; Ward is a linked second way in
_2026-10-13, brief 26; the estate's call is in `../wzd_auth` `decisions-oidc.md`_.
Satchel signs people in itself: a users table in its own database
(`auth_users`, from the vendored `ward-auth` 0.2.0 library), scrypt passwords,
opaque sessions in the `satchel_session` cookie (`Path=/satchel-api`), and a
login page in Satchel's own design. "Sign in with Ward" is a button on that
page. The role lives in that row: `admin` is the owner, `member` a friend. There
is no register page; users are made by `npm run seed -w @satchel/server`
(username, password and role from `SEED_*` environment variables or a prompt,
never a file). The CLI's Claude tokens (`agent_tokens`) are not part of this and
are untouched. Rejected: keeping Ward as the only credential store, because
Satchel stops working whenever Ward does.

**Existing rows keep their keys.** Every `accounts.subject` becomes a local user
whose id is that subject, linked to it (`server/src/auth/migrate.ts`, run on
every boot and idempotent), so no foreign key moves. The old schema never
stored a role, so the owner is whoever has an Ideas inbox (the old guard made
one for `admin` only) and everyone else is `member`; the username is the
account's `display_name`, or `user-<first 8 of the subject>` when that name is
not valid or is taken. A migrated user has no local password until they set one
in Settings. Rejected: asking the owner to list roles, which would put a
step between the deploy and a working app.

**A removed Ward grant no longer locks the account out.** The 2026-10-09
lockout (`accounts.active`, tokens revoked, push subscriptions deleted, on the
next request without a `satchel` grant) needed Satchel to see the grant on every
request. It no longer does: the grant decides only whether a Ward account may
sign in, and a Ward-originated session ends within 30 seconds of Ward ending it.
A local user is Satchel's own and keeps working. `store.lockOutAccount` and the
`active` column stay, unused by the guard, until the owner decides whether
Satchel should grow its own way to switch a person off.

**A live socket re-checks its session every 10 seconds.** The upgrade goes
through the same guard as any request, but a tab with a live socket stops
polling, so it makes no more HTTP requests and the guard's 30-second Ward check
would never run again. A revoked Ward session would keep receiving messages for
the session's whole life, 14 days now that the 15-minute access token no longer
bounds it. So `serveLiveSocket` asks the guard again every 10 seconds, through
`GET /auth/session` with the cookie the socket opened with, and closes with 4001
when the answer is "signed out". That ends a socket within 30 to 40 seconds of a
Ward revoke, and straight away (at the next tick) for a sign-out, a password
change or an unlink, and it fails closed when Ward is down, as HTTP does. A local
socket is unaffected by Ward. Rejected: checking only on connect, which leaves
the stream open for days; a bounded socket lifetime, which still leaves a window
and makes every tab reconnect on a clock; and calling Ward's `checkSession`
directly, which would copy the guard's logic and miss any validator added later.

**`PUBLIC_ORIGIN`.** The guard and the upgrade check refuse a write or a socket
whose `Origin` is not the app's own. The old value was Ward's origin (one shared
origin); the app's origin is now its own setting, defaulting to the origin of
`WARD_OIDC_REDIRECT_URI`. In development it is `http://localhost:5175`, and the
Vite proxy no longer rewrites `Origin`.

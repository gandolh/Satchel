---
summary: Locked calls for Satchel, each with date, rejected alternatives and reason. Own app on the house stack; Claude reads through a CLI, not MCP; reading and marking seen are two calls; one forward-only seen marker per member; order from a server seq; messages are append-only; Claude's token is bound to the inbox; text only; inbox before friends. Read before proposing to change any of these.
updated: 2026-10-09
---

# Decisions

Each entry passed three tests: hard to reverse, surprising without context, and
a real trade-off. Changing one needs an explicit revisit and a `log.md` entry.

## Own app on the house stack
_2026-10-09_. A Fastify + better-sqlite3 API in a Docker container and a Vite +
React PWA, on the shared Caddy VPS through vps-deploy, signed in through Ward. The owner chose it after
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

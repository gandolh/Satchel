---
summary: What Satchel is in a paragraph. A small text messenger for the owner and a few friends whose pinned first chat, the Ideas inbox, is with Claude, who reads it at home through a CLI. Who uses it, what it deliberately leaves out, and where the design came from.
updated: 2026-10-09
---

# Overview

Satchel is a small text messenger for the owner and a handful of friends. Its
first chat, pinned at the top, is the **Ideas inbox**: a conversation whose
other member is Claude. The owner writes ideas there on the go. At home they
ask Claude Code to "check my inbox", Claude reads every unread message in order
through the `satchel` CLI, says what it found, and marks the messages seen. The
phone then shows "Seen" under the last message Claude read, the way WhatsApp
and Messenger do.

Below the inbox, Satchel is an ordinary chat app: one-to-one and small group
chats with friends, with the same seen ticks. Claude can never read those.

"Satchel" is a working name: the bag you carry ideas home in. It is also the
CLI's name.

## The cast

- **The owner.** Writes ideas, chats with friends, runs Claude Code at home.
- **Friends.** A few people the owner knows. They sign in with Ward and only
  ever see their own chats.
- **Claude.** A member of the owner's Ideas inbox and nothing else. It reads
  and marks messages seen through the CLI. It does not write messages (yet).

## What it deliberately leaves out

Photos, voice and files; tags; an offline outbox; editing or deleting
messages; Claude replying in the chat; search; calls; federation; public
signup; an MCP server. Each was considered on 2026-10-09 and set aside. The
locked ones are in [decisions.md](decisions.md); the ones that might come back
are in [open-questions.md](open-questions.md).

## Where things live

Four npm workspaces, as in the-board: `shared` (the zod contract), `server`
(Fastify + SQLite), `web` (the React PWA) and `cli` (the `satchel` command).
See [architecture.md](architecture.md).

## Where the design came from

A design conversation on 2026-10-09, published as the private artifact
<https://claude.ai/artifact/4Q9t857q3wUi5nTSffUmXW> (revision 2). The wiki
is the source of truth now; the artifact is a picture of it, with phone
mockups.

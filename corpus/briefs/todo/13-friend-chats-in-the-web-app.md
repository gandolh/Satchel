# Task 13: Friend chats in the web app

## Context

Brief 11 gave the server people and conversation creation; brief 12 made
updates live. This brief puts friend chats in front of people: starting a
chat, group threads with names and "Seen by", and unread badges for every
conversation.

Read [design.md](../../wiki/design.md) (chat list, thread, message states,
the "Claude has no access to this chat" pill) and the "Seen by" rule in
[messages-and-seen.md](../../wiki/messages-and-seen.md). Use `seenLine`,
`tickState` and `unreadCount` from `shared`.

## Files you OWN

```
web/src/api.ts   (functions for the brief 11 routes)
web/src/chats/*  web/src/thread/*  web/src/people/*  web/src/router.ts   (one route)
web/src/settings/ConnectClaude.tsx   (hidden for friends)
web/src/**/*.test.ts for the above
```

## Files you must NOT touch

`shared/`, `server/`, `cli/`, `corpus/`, `web/src/live.ts`,
`web/src/ward.ts`, `web/src/auth/`.

## What to do

1. **API client.** Typed functions for `GET /api/people` and
   `POST /api/conversations`.
2. **Chat list.** Every conversation, the inbox pinned first for the owner
   (friends have none: `/api/me` gives `inboxId: null`), the rest by latest
   message. Connect Claude renders nothing when `inboxId` is null.
   Direct chats are titled with the other person's name; groups with their
   title and member names as the preview subtitle. Unread badges from
   `unreadCount`.
3. **New chat.** A compose button in the chat list header opens
   `/satchel/new`: a searchable list of people. Picking one opens (or
   reuses) the direct chat. "New group" lets you pick two or more and name
   the group, then creates it and opens it. Empty state when no friend has
   signed in yet: "No one else is on Satchel yet. Friends appear here after
   they sign in for the first time."
4. **Threads.** Sender names above their first bubble in a run, in groups
   only. The "Seen" line from `seenLine`: "Seen 21:40" in direct chats,
   "Seen by Maria, Andrei" in groups (with "+2" past three names). The
   centred "Claude has no access to this chat" pill at the top of every
   direct and group thread, never in the inbox.

## Acceptance

- Unit tests: chat list ordering with the inbox pinned; direct chat titles;
  the "Seen by" truncation.
- In a browser with three local accounts (create the extra ones in the
  local Ward console and grant them Satchel): start a direct chat, start a
  group of three, exchange messages, and watch unread badges and "Seen by"
  update live; at 390px and 1280px, light and dark.
- `npm run typecheck && npm run lint && npm test` pass.

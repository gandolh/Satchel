# Task 12: Live updates over WebSocket

## Context

Phase 1 polls: the chat list every 10 seconds, an open thread every 3. With
friends that feels slow and wastes requests. This brief adds one WebSocket
per open tab at `/api/live` that pushes new messages and seen changes, and
keeps polling only as the fallback while the socket is down.

The seen rules are in [messages-and-seen.md](../../wiki/messages-and-seen.md);
the Ward guard and the 15-minute access token in
[architecture.md](../../wiki/architecture.md). Caddy's `reverse_proxy`
already passes WebSocket upgrades.

## Files you OWN

```
server/package.json   (add @fastify/websocket)
server/src/live/*  server/src/routes/live.ts  server/src/app.ts   (register live)
server/src/routes/conversations.ts  server/src/routes/claude.ts   (publish events only)
server/src/live/*.test.ts
web/src/live.ts  web/src/live.test.ts
web/src/chats/*  web/src/thread/*   (swap polling for live updates)
```

## Files you must NOT touch

`shared/` except adding the event schemas to `shared/src/api.ts`;
`server/src/store.ts`; `server/src/ward/`; `cli/`; `corpus/`.

## What to do

1. **Events** in `shared`: `message { conversationId, message }`,
   `seen { conversationId, member, seenUpTo, seenAt }`, and
   `conversation { conversation }` for a newly created chat.
2. **Hub** (`server/src/live/hub.ts`): sockets by subject. `publish(event,
   memberSubjects)` sends to every socket of those members. In-process only;
   there is one container.
3. **Publishing.** After a successful store call: posting a message
   publishes `message` to the conversation's members; `seen` (from the web
   or from `/claude/seen`) publishes `seen`; creating a conversation
   publishes `conversation`. A failed publish never fails the request.
   Claude's `seen` goes to the owner's sockets, so the ticks turn blue while
   the owner watches.
4. **`GET /api/live`** behind the Ward guard (the upgrade request carries the
   cookie). Use `@fastify/websocket` at the newest release at least two
   weeks old that supports Fastify 5. Ping every 25 seconds. Close with code
   4001 when the session's access token expires (its `exp`), so a socket
   never outlives its session.
5. **Client** (`web/src/live.ts`). Connect after sign-in; reconnect with
   backoff from 1 to 30 seconds; on 4001, refresh the Ward session first. On
   every (re)connect, catch up: refetch the chat list, and for an open
   thread fetch `after=<latestSeq>`, then apply events. While connected, stop
   the chat list and thread polling; while disconnected, poll as before.
   Ignore an event whose seq is already shown.

## Acceptance

- Server tests with two connected sockets for A and one for B: a message in
  A's inbox reaches only A's sockets; a message in an A–B chat reaches both;
  `/claude/seen` reaches A's sockets; a socket closes with 4001 at token
  expiry (use the test clock); no Claude token can open `/api/live`.
- Client tests: catch-up after reconnect applies missed messages once;
  polling stops while connected and resumes on disconnect.
- In a browser with two accounts in two windows: a message appears in the
  other window in under a second; the seen line updates live.
- `npm run typecheck && npm run lint && npm test` pass.

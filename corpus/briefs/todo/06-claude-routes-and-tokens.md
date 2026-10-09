# Task 06: Claude routes and Claude tokens

## Context

Claude reads the Ideas inbox through three routes behind a bearer token, and
the owner creates and revokes that token from Settings through three more.
Everything about the token and the routes is in
[claude-access.md](../../wiki/claude-access.md); why reading and marking are
separate calls is in [messages-and-seen.md](../../wiki/messages-and-seen.md).

The rule that matters most: **a Claude token reaches its own inbox and
nothing else.** Every `/claude/*` handler takes the conversation id from the
resolved token. No route accepts a conversation id from Claude.

Brief 04 left `server/src/routes/claude.ts` and `server/src/routes/tokens.ts`
as empty plugins that `buildApp` registers. `tokens.ts` sits behind the Ward
guard; `claude.ts` is outside it. Brief 05 runs in parallel.

## Files you OWN

```
server/src/routes/claude.ts  server/src/routes/tokens.ts
server/src/routes/claude.test.ts  server/src/routes/tokens.test.ts
```

## Files you must NOT touch

`server/src/app.ts`, `server/src/ward/`, `server/src/store.ts`,
`server/src/db/`, `server/src/routes/conversations.ts`, `shared/`, `web/`,
`cli/`, `corpus/`. If the store lacks something you need, stop and say what.

## What to do

1. **Bearer hook** in `claude.ts`, scoped to `/claude/*`: read
   `Authorization: Bearer <token>`, `store.resolveClaudeToken(token)`. Missing,
   malformed, unknown or revoked → 401 `unauthorized` with the message "Unknown
   or revoked Claude token. Create a new one in Satchel under Settings →
   Connect Claude." Never read the Ward cookie here, never call Ward, and
   never log the token or the `Authorization` header (configure Fastify's
   logger to redact it).
2. **`GET /claude/unread`** → `{ seenUpTo, messages }` from
   `store.unreadFor(conversationId, "claude")`, each message reduced to
   `{ seq, sentAt, text }`. Changes nothing.
3. **`POST /claude/seen`** `{ upTo }` → `store.markSeen(conversationId,
   "claude", upTo)` → `{ seenUpTo }`.
4. **`GET /claude/messages?after=&since=&limit=`** → messages of the inbox in
   seq order with `seen: seq <= claude's marker`. `since` filters on
   `sentAt`. Limit as in the shared schema.
5. **Token routes** in `tokens.ts`, behind the Ward guard:
   - `GET /api/claude-tokens` → the caller's tokens (id, createdAt,
     lastUsedAt, revokedAt), newest first. Never the token or its hash.
   - `POST /api/claude-tokens` → `store.createClaudeToken(subject)` →
     `{ id, token, createdAt }`, with `Cache-Control: no-store`.
   - `POST /api/claude-tokens/:id/revoke` → `{ id, revokedAt }`; another
     account's token or an unknown id → 404.
6. A Ward session on `/claude/*` is 401 (no bearer), and a Claude token on
   `/api/*` is 401 (the guard ignores bearer headers). Both are tests.

## Acceptance

Tests use `buildApp` with an in-memory store and `fakeWard`, accounts A and B,
and cover:

- A creates a token; `unread` returns A's inbox messages in seq order;
  `seen` then `unread` returns nothing;
- the race: `unread` (#1 to #4), A posts #5, `seen {upTo: 4}`, `unread`
  returns #5 only;
- B's inbox messages never appear in any `/claude/*` response for A's token,
  including `messages` with `after=0`;
- a revoked token → 401; a missing or malformed header → 401;
- a Ward cookie alone on `/claude/unread` → 401; A's Claude token on
  `/api/conversations` → 401;
- `GET /api/claude-tokens` never includes a token or hash; B can't revoke A's
  token;
- the test logger's output contains no token string.

`npm run typecheck && npm run lint && npm test` pass.

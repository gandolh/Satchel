# Task 05: Conversation routes

## Context

The web app reads and writes conversations through four routes. They are
defined in `shared/src/api.ts` (brief 02) and are generic: in phase 1 the
only conversation is the Ideas inbox, and in phase 2 the same routes serve
friend chats. The rules are in
[messages-and-seen.md](../../wiki/messages-and-seen.md).

Brief 04 left `server/src/routes/conversations.ts` as an empty plugin that
`buildApp` already registers behind the Ward guard, with `{ subject,
username }` on each request. Brief 06 runs in parallel and owns the Claude
routes; neither touches `app.ts`.

## Files you OWN

```
server/src/routes/conversations.ts  server/src/routes/conversations.test.ts
```

## Files you must NOT touch

`server/src/app.ts`, `server/src/ward/`, `server/src/store.ts`,
`server/src/db/`, the other route files, `shared/`, `web/`, `cli/`,
`corpus/`. If the store lacks something you need, stop and say what, rather
than adding SQL here.

## What to do

1. **`GET /api/conversations`** → the caller's conversations from
   `store.listConversations(subject)`. The inbox is first.
2. **`GET /api/conversations/:id/messages?after=&limit=`**. Validate the
   query with the shared schema (`limit` defaults to 200, at most 500).
   `store.getConversation(id, subject)` is `null` → 404 `not_found`. Return
   the summary, the messages above `after` in seq order, and `latestSeq`.
3. **`POST /api/conversations/:id/messages`** with `{ clientId, text }`.
   Non-member → 404. `store.appendMessage({ conversationId, sender: subject,
   clientId, text })`. Created → 201; already stored → 200 with the stored
   message; `ClientIdConflict` → 409 `client_id_conflict`. Invalid text
   (empty, whitespace only, over 4000 characters) → 400 `invalid_request`
   from the shared schema.
4. **`POST /api/conversations/:id/seen`** with `{ upTo }`. Non-member → 404.
   `store.markSeen(id, subject, upTo)` → `{ seenUpTo }`.
5. Validate every request and response with the shared schemas, so a
   response that drifts from the contract fails the tests, not the client.

## Acceptance

Tests use `buildApp` with an in-memory store and `fakeWard`, with two signed-in
accounts A and B, and cover:

- A lists conversations and sees only A's inbox;
- A posts three messages and reads them back in seq order, with `after`
  paging;
- the same `clientId` posted twice → 201 then 200, one stored row;
- the same `clientId` with different text → 409;
- empty, whitespace-only and 4001-character text → 400;
- B reading, posting to or marking A's inbox → 404, and A's inbox is
  unchanged;
- `seen` with a lower `upTo` leaves the marker where it was, and `upTo` past
  the latest seq is clamped;
- after A sends, A's own marker equals the new seq and A's unread count is 0.

`npm run typecheck && npm run lint && npm test` pass.

## Outcome (2026-10-09)

Done in commit `91721cf`, with 16 tests, inside the two owned files. Every
acceptance case is covered, plus `limit=501` → 400, a nonexistent
conversation → 404, and stored text normalised from `\r\n` to `\n`.

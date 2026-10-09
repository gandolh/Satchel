# Task 02: Shared contract

## Context

Every later brief builds on this one: 03 to 06 implement it on the server,
07 and 08 call it. They only stay in step if every route's request and
response shape, the error shape and the seen rules live in one place: the
`shared` workspace. Get it right here and the others only import
it.

Read [messages-and-seen.md](../../wiki/messages-and-seen.md) for the seen
rules and [claude-access.md](../../wiki/claude-access.md) for the Claude
routes. Use the words in [glossary.md](../../wiki/glossary.md) for type and
field names: conversation, member, message, seq, client ID, seen marker.

This brief covers phase 1 (the Ideas inbox). Brief 11 extends the contract
for friend chats.

## Files you OWN

```
shared/src/index.ts  shared/src/limits.ts  shared/src/model.ts
shared/src/api.ts  shared/src/seen.ts  shared/src/*.test.ts
```

## Files you must NOT touch

`server/`, `web/`, `cli/`, `corpus/`.

## What to do

1. **Limits** (`limits.ts`). `MAX_TEXT_LENGTH = 4000` characters.
   `CLAUDE_MEMBER = "claude"`, the member id Claude has in an Ideas inbox.
   `PAGE_LIMIT_DEFAULT = 200`, `PAGE_LIMIT_MAX = 500`.
2. **Model** (`model.ts`), as zod schemas with inferred types:
   - `ConversationKind`: `"inbox" | "direct" | "group"`.
   - `Member`: `id` (a Ward subject or `"claude"`), `displayName`,
     `seenUpTo` (integer ≥ 0), `seenAt` (ISO string or null).
   - `Message`: `seq` (positive integer), `conversationId`, `sender` (a member
     id), `clientId` (UUID), `text`, `sentAt` (ISO 8601 UTC).
   - `ConversationSummary`: `id`, `kind`, `title` (string or null; the inbox's
     is null and the UI shows "Claude"), `members`, `lastMessage` (Message or
     null), `unreadCount`.
   - `MessageText`: a string, normalised to `\n` line endings, at least one
     non-whitespace character, at most `MAX_TEXT_LENGTH`. Don't trim the
     stored text.
3. **API** (`api.ts`). One object per route with `method`, `path`, `auth`
   (`"none" | "ward" | "claude"`), and zod `params`, `query`, `body`,
   `response` as applicable. Paths are relative to the API base; Caddy serves
   the API at `/satchel-api` in production.
   - `GET /api/health`, auth none → `{ ok: true }`.
   - `GET /api/me`, ward → `{ subject, displayName, inboxId }`.
   - `GET /api/conversations`, ward → `{ conversations: ConversationSummary[] }`.
   - `GET /api/conversations/:id/messages?after=&limit=`, ward →
     `{ conversation: ConversationSummary, messages: Message[], latestSeq }`.
     Messages with seq above `after` (default 0), ascending, at most `limit`.
   - `POST /api/conversations/:id/messages`, ward, body
     `{ clientId, text: MessageText }` → `{ message: Message }`. 201 when
     stored, 200 when the client ID was already stored with the same text in
     the same conversation.
   - `POST /api/conversations/:id/seen`, ward, body `{ upTo }` →
     `{ seenUpTo }`.
   - `GET /api/claude-tokens`, ward → `{ tokens: { id, createdAt,
     lastUsedAt, revokedAt }[] }`.
   - `POST /api/claude-tokens`, ward → `{ id, token, createdAt }`. The only
     response that ever carries a token.
   - `POST /api/claude-tokens/:id/revoke`, ward → `{ id, revokedAt }`.
   - `GET /claude/unread`, claude → `{ seenUpTo, messages: { seq, sentAt,
     text }[] }`. Claude's view never includes `sender` or `clientId`.
   - `POST /claude/seen`, claude, body `{ upTo }` → `{ seenUpTo }`.
   - `GET /claude/messages?after=&since=&limit=`, claude → `{ messages: { seq,
     sentAt, text, seen }[] }`. `since` is an ISO date or date-time.
   Export the error shape `{ error: { code, message } }` with codes
   `unauthorized` (401: no session, or an unknown or revoked Claude token),
   `forbidden` (403: a valid Ward session without a Satchel grant),
   `not_found`, `invalid_request`, `client_id_conflict` (409) and
   `unavailable` (503: Ward unreachable). A conversation the caller isn't a
   member of is `not_found`, never `forbidden`, so its existence doesn't leak.
4. **Seen rules** (`seen.ts`), pure functions the server and web both use:
   - `nextSeenUpTo(current, requested, latestSeq)` → `min(max(current,
     requested), latestSeq)`.
   - `isSeenBy(member, seq)`.
   - `tickState(message, members, me)` → `"sent" | "seen"`: seen when every
     member other than the sender has `seenUpTo ≥ seq`.
   - `seenLine(messages, members, me)` → for a conversation with one other
     member, the newest of my messages that member has seen and their
     `seenAt`; for a group, the member names whose marker is at or above my
     last message. `null` when nothing to show.
   - `unreadCount(messages, member)`, counting messages above the marker not
     sent by that member.
5. **Index** re-exports everything.

## Acceptance

- Tests cover: `MessageText` rejects empty, whitespace-only and 4001-character
  text and normalises `\r\n`; `nextSeenUpTo` never decreases and clamps to
  `latestSeq`; `tickState` in a two-member and a four-member conversation;
  `seenLine` for the inbox (other member `claude`) and for a group; every
  route object parses a sample request and response.
- No runtime dependency other than zod.
- `npm run typecheck && npm run lint && npm test` pass.

# Task 18 — Claude replies in the Ideas inbox

## Context

The owner decided on 2026-10-28 (the widening of "Claude's token is bound to
the inbox conversation" in [decisions.md](../../wiki/decisions.md)): **Claude
may reply in the Ideas inbox**, through a `satchel reply` command and a
`POST /claude/messages` route. The token stays bound to its conversation, so a
reply can only land in the inbox; it gains the right to post there and nothing
else. Waiting for real use first was offered and declined.

Today Claude reads and marks only. `server/src/routes/claude.ts` has
`GET /claude/unread`, `POST /claude/seen` and `GET /claude/messages`, each
taking the conversation from the token (`claudeToken(request)`), never from the
request. Claude is already a member of the inbox as `CLAUDE_MEMBER`
(`"claude"`, display name "Claude", in `shared/src/limits.ts`), which is how
its seen marker works. The CLI is `cli/` (`satchel guide | unread | seen |
history`, in `cli/src/main.ts`), and `cli/src/guide.md` is the text Claude
reads first. [claude-access.md](../../wiki/claude-access.md) describes the
whole arrangement.

An ordinary send goes through `store.appendMessage({ conversationId, sender,
clientId, text })` in `server/src/routes/conversations.ts`, then
`live.messageStored` and `push.messageStored`. Messages are append-only and
text only, at most `MAX_TEXT_LENGTH` (4000).

## Files you OWN

- `server/src/routes/claude.ts` and `claude.test.ts`
- `shared/src/api.ts` (the route's schema) and its test
- `cli/src/main.ts`, `cli/src/client.ts`, `cli/src/format.ts`,
  `cli/src/guide.md`, `cli/src/cli.test.ts`
- `web/` only if a message from `claude` needs its own look in the thread
  (check first; the seen ticks already know the member)
- corpus: this brief's outcome, `corpus/wiki/claude-access.md`,
  `corpus/wiki/status.md`, `corpus/log.md`

## Files you must NOT touch

- Anything that lets a Claude token name a conversation. The hard rule
  "Claude never reads friend chats" holds for writing too.
- The message table's shape: no edits or deletes, ever.

## What to do

1. **Route.** `POST /claude/messages` with `{ clientId, text }`, the same body
   as an ordinary send. The conversation comes from the token; the sender is
   `CLAUDE_MEMBER`. Append through `store.appendMessage`, then
   `live.messageStored` and `push.messageStored`, so the owner sees it live
   and gets a push like any message. A repeated `clientId` returns the stored
   message, as sends do. Over-long text is a 400.
2. **Seen.** Posting moves Claude's own seen marker to its message only if
   that is what an ordinary sender's marker does; follow the existing rule
   and say which in the outcome.
3. **CLI.** `satchel reply <n> <text>` (or text on stdin, for longer replies)
   posts a reply. `<n>` is the message number being answered, written into the
   text as a short "Re #n:" prefix, since messages have no reply field. Print
   the stored message's number. Exit codes as the other commands.
4. **Guide.** Add when to reply to `guide.md`: answer in the thread when the
   owner asks something there, keep it short, never paste secrets or the
   token, and still report in the session as before. Replying does not replace
   `satchel seen`.
5. **Revoking** a token still stops it at once, for posting as for reading.

## Acceptance

- `satchel reply 12 "Done, see the brief"` posts a message from Claude into
  the inbox; the owner's open thread shows it live, and a push arrives on
  Android.
- A Claude token for one inbox can't post anywhere else: there is no
  parameter to try, and a test proves the route ignores any conversation id in
  the body or query.
- A revoked token gets 401 on `POST /claude/messages`.
- Retrying with the same `clientId` stores one message.
- `npm run typecheck`, `npm run lint`, `npm test` pass.

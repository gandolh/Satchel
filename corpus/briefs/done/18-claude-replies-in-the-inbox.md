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

## Outcome (2026-10-28)

Shipped in `e03348f`. `POST /claude/messages` takes `sendMessageRequestSchema`
(`{ clientId, text }`) and answers a strict `{ message: { seq, sentAt, text } }`
(`routes.claudeReply` in `shared/src/api.ts`). The conversation comes from
the token and the sender is `CLAUDE_MEMBER`. It stores through
`store.appendMessage`, then calls `live.messageStored` and
`push.messageStored`. A repeated client ID gives 200 and the stored message;
the same ID with other text, or an owner's ID, is 409. Over-long or blank
text is 400 and a revoked token 401. `satchel reply <n> [text]` posts
`Re #n: text` (the words after `<n>`, or stdin), prints `Replied as #m.`,
and exits 0/1/2/3 like the other commands. `guide.md` has rule 8, and
`satchel history` shows Claude's messages as `(Claude's reply)`.

**Seen: the existing rule was checked and deliberately not followed.**
`appendMessage` does move a sender's own marker to their message ("sending
marks seen"). For Claude that would mark seen any message the owner sent
between Claude's `unread` and its reply, and the marker can't go back. That
is the loss the locked decision "Reading and marking seen are two calls"
exists to prevent. So `appendMessage` takes `markSenderSeen: false` and
Claude's reply leaves the marker alone; only `satchel seen` moves it. A
server test (`claude.test.ts`, "leaves Claude's seen marker where it is")
and a CLI test show the mid-reply message still unread afterwards. The
cost: the owner's ticks turn blue at `satchel seen`, not at the reply. It is
in `decisions.md` and is the open question in `open-questions.md` for the
owner to confirm.

Touched outside the OWN list, because the acceptance needs them:
`server/src/push/payload.ts` (`pushRecipients` returned nobody for the inbox
with "Claude never sends"; it now drops only the sender and Claude, so a
reply pushes to the owner and the owner's notes still to nobody),
`server/src/store.ts` (the `markSenderSeen` option, still refusing a
non-member), `cli/src/config.ts` and `cli/src/index.ts` (stdin), and the
claims in `README.md`, `docs/architecture.md` and `docs/owner-setup.md` that
Claude doesn't reply. `GET /claude/messages` gained a `fromClaude` flag (a
boolean, never the sender), because history couldn't otherwise tell Claude's
replies from the owner's notes. `web/` needed nothing: Claude's message is an
ordinary bubble on the left in the inbox, and the chat list previews it with
an unread badge.

How it was checked: typecheck, lint, 577 tests (23 new). The route tests
cover a `conversationId`/`id` in the body and the query aimed at a friend
chat and at another owner's inbox (stored in the token's inbox; the targets
stay empty), the 401 after revoking, one row for a repeated client ID, the
400s, and the marker staying put. The live test shows the owner's two sockets
get the message and a friend's gets nothing; the push test shows one push to
the owner's device titled "Claude". End to end: the built API on a scratch
`DATA_DIR`, the built web app under `vite preview`, the owner's inbox open in
headless Chrome. `node cli/dist/index.js reply 6 "Done, see the brief"`
printed `Replied as #7.`, and the bubble appeared in the open thread about
0.5 s later from a `message` frame on the WebSocket, with no reload. `unread`
still listed #6, and `satchel seen 6` then put "Seen" under it.

The CLI makes a new client ID each run and doesn't retry. The route's
repeated-ID guard covers a client that does retry; for the CLI, rerunning
after a timeout can post twice, and a message can't be deleted. The guide
(rule 8) and `claude-access.md` say to check `satchel history` after an exit
3 before sending again.

Owner steps (no phone or deploy here):

1. After the next deploy of the server and web app, run `npm run build` in
   this repo so the linked CLI matches. An older CLI stops on `history` with
   "Is the CLI out of date?" (the new `fromClaude` field).
2. With the inbox open on the Android phone, in Claude Code, run
   `satchel reply <n> "Done, see the brief"` against a real message: it shows
   in the open thread at once. Close the app and reply again: the push
   arrives, titled "Claude".
3. Answer the open question: keep "a reply marks nothing seen", or have the
   reply mark the inbox seen up to it, as a person's send does.

# Task 09: Inbox thread and Connect Claude

## Context

The two screens that make phase 1 usable: the thread where the owner writes
ideas and watches Claude's seen ticks, and the Settings section that creates
the Claude token the CLI needs.

Read [design.md](../../wiki/design.md) for the thread's look and every
message state, [messages-and-seen.md](../../wiki/messages-and-seen.md) for
sending, retries and how ticks and "Seen" lines are derived, and
[claude-access.md](../../wiki/claude-access.md) for the token. Use
`tickState`, `seenLine` and `unreadCount` from `shared`; don't re-derive
them.

Brief 08 built the shell, the router (`/satchel/c/:id`), the API client
(every phase-1 route is already a typed function in `web/src/api.ts`) and a
slot in Settings. Briefs 05 and 06 built the routes this calls.

## Files you OWN

```
web/src/thread/*  web/src/settings/ConnectClaude.tsx  web/src/thread/*.test.ts
```

## Files you must NOT touch

`web/src/api.ts`, `web/src/ward.ts`, `web/src/auth/`, `web/src/router.ts`,
`web/src/chats/`, `shared/`, `server/`, `cli/`, `corpus/`. If the API
client lacks something, stop and say what.

## What to do

1. **Thread view.** Header per design.md. Load the latest page of messages,
   then poll `GET …/messages?after=<latestSeq>` every 3 seconds while the
   page is visible (and at once when it becomes visible). Each response's
   member list refreshes the seen markers, so ticks and the "Seen" line
   update without a reload. Day separators in local time.
2. **Composer.** Grows to five lines. Enter sends on a desktop keyboard,
   Shift+Enter is a newline; on touch devices Enter is a newline and the
   Send button sends. The Send button is disabled for whitespace-only text.
   The 4000-character limit shows a counter from 3800.
3. **Sending.** On send, create a client ID (`crypto.randomUUID()`), show
   the bubble at once as Sending, clear the composer, and post. On success,
   replace the pending bubble with the stored message (match on client ID).
   On failure (network error, 5xx, timeout after 10 seconds) mark it "Not
   sent. Tap to retry"; tapping retries with the same client ID. A 409 or
   400 shows the server's message under the bubble and offers no retry.
   Pending and failed bubbles are kept in memory only.
4. **Own seen marker.** While the thread is open and visible, post
   `seen { upTo: latestSeq }` whenever messages from someone else arrive.
5. **Scrolling.** Open at the bottom. After your own send, scroll to it. If
   new messages arrive while you are scrolled up, show a "New messages" pill
   instead of jumping.
6. **Connect Claude** (Settings). Lists tokens with created and last-used
   times ("Never used" when null) and revoked ones greyed out. "Create token"
   posts and shows the token once in a panel with a copy button, the exact
   line `SATCHEL_TOKEN=<token>`, the file it goes in
   (`~/.config/satchel/env`), and "This is the only time Satchel shows this
   token." Closing the panel drops the token from memory. "Revoke" asks for
   confirmation inline (a second button), then revokes. The clipboard copy
   catches failure and selects the text instead.

## Acceptance

- Unit tests cover pending-bubble reconciliation by client ID, the failed →
  retry path keeping the client ID, and day separators across midnight.
- In a browser against local Ward and `npm run dev`, at 390px and 1280px:
  send three messages and see one tick each; create a token in Settings;
  `curl -X POST -H "Authorization: Bearer $T"
  http://127.0.0.1:8807/claude/seen -d '{"upTo":<seq>}'` with
  `content-type: application/json` turns the ticks to two and shows "Seen
  HH:MM" within 3 seconds; go offline (devtools or agent-browser), send,
  see "Not sent", go online, retry, and confirm one stored row; revoke the
  token and see the CLI-style call answer 401. Keep the token out of every
  file and screenshot you save.
- `npm run typecheck && npm run lint && npm test` pass.

## Outcome (2026-10-09)

Done in commit `9084340` (255 tests in the suite). The thread's logic is a
pure reducer in `web/src/thread/model.ts`, with 10 tests;
`ThreadPlaceholder.tsx` now only re-exports `ThreadScreen`. The live check
with local Ward passed at 390px and 1280px:

- one tick per message, turning into two ticks and "Seen HH:MM" within
  about 3.6 seconds of `POST /claude/seen`;
- an offline send showed "Not sent", and its retry stored exactly one row;
- the token was shown once, and a revoked token answered 401.

Calls the brief left open:

- The first load pages forward up to 2000 messages; there is no "load
  older" control.
- Polling failures show a muted "Can't reach Satchel. Trying again." strip,
  not Not-sent bubbles.
- Sender names, the privacy pill and "Seen by" already render for direct
  and group threads, but only the inbox was tested live.

The clipboard-failure fallback wasn't exercised. Local test data: about
seven inbox messages and two revoked tokens.

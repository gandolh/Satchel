---
summary: How messages are numbered, stored and marked seen. The server seq and why gaps are normal, client IDs and safe retries, the forward-only seen marker, how unread counts, ticks, "Seen" lines and group "Seen by" are derived from it, and the race the two-call read protects against.
updated: 2026-10-09
---

# Messages and seen

The rules here are locked in [decisions.md](decisions.md). This page is how
they fit together.

## A message

```
seq        INTEGER PRIMARY KEY AUTOINCREMENT   -- order, across all conversations
conversation_id, sender
client_id  TEXT UNIQUE                         -- from the sender's device
text       TEXT                                -- 1 to 4000 characters
sent_at    TEXT                                -- server receive time, ISO 8601 UTC
```

Nothing ever changes a stored message. Triggers raise on `UPDATE` and
`DELETE`.

## Sending, and safe retries

1. The device makes a client ID (a UUID) when the owner presses Send, and keeps
   it with the text until the server answers.
2. `POST /api/conversations/:id/messages { clientId, text }`. The server inserts
   the row and returns it with its `seq` and `sentAt`.
3. If the same client ID arrives again, the server returns the stored row with
   `200` instead of `201` and inserts nothing. So a Retry after a timeout can't
   create a duplicate, even when the first request did land.
4. If the request fails, the bubble stays in the chat marked "Not sent. Tap to
   retry". Retry sends the same client ID. Nothing is kept across a page
   reload; there is no outbox (see decisions).

A client ID that already exists in a *different* conversation, from a
different sender, or with different text, is a `409`. That only happens with a bug, and silently
returning the other row would hide it.

## The seen marker

Every member of a conversation has `members.seen_up_to`, a seq (0 at join).

- **Forward only.** `UPDATE members SET seen_up_to = max(seen_up_to, ?)`. A
  smaller `upTo` is accepted and changes nothing, so repeating a call is
  harmless.
- **Bounded.** `upTo` above the conversation's latest seq is clamped to the
  latest seq, so a member can't pre-mark messages that don't exist yet.
- **Sending marks seen.** When a member sends a message, their own marker moves
  to that message's seq. You have seen everything up to what you just wrote.

## What the marker gives

| Shown where | Derived how |
|---|---|
| Unread count in the chat list | messages in the conversation with seq above my marker |
| One grey tick on my message | some other member's marker is below its seq |
| Two blue ticks on my message | every other member's marker is at or above its seq |
| "Seen 21:40" under a message | the newest of my messages at or below the other member's marker, in a one-to-one chat or the inbox. The time is when the marker last moved |
| "Seen by Maria, Andrei" in a group | the members whose marker is at or above my last message |
| Claude's `unread` | inbox messages above Claude's marker |

`members.seen_at` records when the marker last moved, for the time in "Seen
21:40".

## Why reading and marking are two calls

```
Claude: GET  /claude/unread      → #39 #40 #41 #42
Owner:  sends a message          → #43
Claude: POST /claude/seen {42}   → marker = 42
next time: unread                → #43
```

If reading also marked, the marker would have to move to "everything up to
now", and #43 would be marked seen without Claude ever getting it. With `upTo`,
Claude marks exactly what it printed. A dropped response or an ended session
before `seen` just means the same messages come back next time. Nothing is
lost.

## Gaps

`seq` is one counter for the whole database. The inbox shows #41 then #44 when
two friend messages arrived in between. The CLI and the guide say gaps are
normal, so Claude doesn't report missing messages.

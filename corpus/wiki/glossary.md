---
summary: Satchel's vocabulary, one canonical word per concept with the synonyms it replaces. Ideas inbox, conversation, member, message, seq, client ID, seen marker, seen, unread, Claude token, the guide, owner, friend.
updated: 2026-10-09
---

# Glossary

## Chats

**Ideas inbox**:
The owner's conversation with Claude, pinned first in the chat list. Only
accounts with the `admin` role on Satchel have one.
_Avoid_: notes, self-chat, saved messages, Claude chat

**Conversation**:
A chat with a fixed set of members. Its kind is `inbox`, `direct` or `group`.
_Avoid_: room, thread, channel. ("Chat" is fine in UI copy.)

**Member**:
An account, or Claude, that belongs to a conversation and has a seen marker in
it.
_Avoid_: participant, user (for this meaning)

**Owner**:
The person who runs Satchel and whose Claude reads their Ideas inbox.
_Avoid_: admin, me

**Friend**:
Any other account that signs in to Satchel through a Ward grant.
_Avoid_: contact, user

## Messages

**Message**:
One piece of text a member sent to a conversation. Never edited, never
deleted.
_Avoid_: note, idea, post

**Seq**:
The server-assigned number that orders every message across all
conversations. Shown to Claude as `#42`.
_Avoid_: id, message id, index, timestamp (for ordering)

**Client ID**:
A random ID the sender's device attaches to a message so that a retried send
is stored once.
_Avoid_: nonce, idempotency key, dedupe key

**Seen marker**:
A member's `seen_up_to` seq in one conversation. It only moves forward.
_Avoid_: read cursor, watermark, last read, read receipt

**Seen**:
A message is seen by a member when its seq is at or below that member's seen
marker.
_Avoid_: read (for this meaning), acknowledged

**Unread**:
The messages in a conversation after a member's seen marker that the member
did not send.
_Avoid_: new, pending

## Claude

**Claude token**:
The secret the `satchel` CLI sends as a bearer token. Created in Settings,
shown once, bound to one Ideas inbox.
_Avoid_: API key, access token (Ward's term), MCP token

**The guide**:
The rules `satchel guide` prints for Claude. They live only in the CLI.
_Avoid_: instructions, prompt, help text

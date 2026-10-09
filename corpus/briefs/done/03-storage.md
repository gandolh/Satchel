# Task 03: Storage

## Context

Everything the server knows lives in one SQLite file. This brief owns the
schema and the only module that touches it, the store. Brief 04 (sign-in),
05 (conversation routes) and 06 (Claude routes) call the store and never run
SQL themselves.

The rules are locked in [decisions.md](../../wiki/decisions.md) and explained
in [messages-and-seen.md](../../wiki/messages-and-seen.md): one server seq
across all conversations, client IDs for safe retries, one forward-only seen
marker per member, append-only messages. The token rules are in
[claude-access.md](../../wiki/claude-access.md). Use the shared types and the
seen helpers from brief 02 rather than redefining them.

## Files you OWN

```
server/src/db/open.ts  server/src/db/migrations.ts
server/src/store.ts  server/src/store.test.ts  server/src/clock.ts
```

## Files you must NOT touch

`shared/`, `web/`, `cli/`, `corpus/`, and the server's routes and app setup
(briefs 04 to 06).

## What to do

1. **Opening** (`server/src/db/open.ts`). `openDb(path)` with better-sqlite3:
   `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`. Creates
   the parent directory. `:memory:` works for tests. The server decides the
   path: `DATA_DIR` (default `./data`) plus `satchel.db`.
2. **Migrations** (`server/src/db/migrations.ts`). An ordered list of SQL strings applied
   in one transaction each, tracked with `PRAGMA user_version`. Migration 1:
   ```
   accounts      subject TEXT PK, display_name TEXT NOT NULL,
                 created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
   conversations id TEXT PK, kind TEXT NOT NULL CHECK (kind IN ('inbox','direct','group')),
                 title TEXT, created_by TEXT NOT NULL REFERENCES accounts(subject),
                 created_at TEXT NOT NULL
                 + UNIQUE index on created_by WHERE kind = 'inbox'   -- one inbox per account
   members       conversation_id TEXT REFERENCES conversations(id), member TEXT NOT NULL,
                 seen_up_to INTEGER NOT NULL DEFAULT 0, seen_at TEXT,
                 joined_at TEXT NOT NULL, PRIMARY KEY (conversation_id, member)
   messages      seq INTEGER PRIMARY KEY AUTOINCREMENT,
                 conversation_id TEXT NOT NULL REFERENCES conversations(id),
                 sender TEXT NOT NULL, client_id TEXT NOT NULL UNIQUE,
                 text TEXT NOT NULL, sent_at TEXT NOT NULL
                 + index on (conversation_id, seq)
   agent_tokens  id TEXT PK, owner_subject TEXT NOT NULL REFERENCES accounts(subject),
                 conversation_id TEXT NOT NULL REFERENCES conversations(id),
                 token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
                 last_used_at TEXT, revoked_at TEXT
   ```
   Plus two triggers, `BEFORE UPDATE ON messages` and `BEFORE DELETE ON
   messages`, that `RAISE(ABORT, 'messages are append-only')`. Push
   subscriptions come in brief 14 as migration 2 or later; leave room, add
   nothing for them now.
3. **Clock** (`clock.ts`). `type Clock = () => Date`, `systemClock`. The store
   takes a clock so tests control times.
4. **Store** (`store.ts`). `createStore(db, clock)` returning:
   - `upsertAccount(subject, displayName)`: insert or update the name and
     `last_seen_at`.
   - `ensureInbox(subject)` → inbox id. Creates the conversation and two
     members (`subject` and `"claude"`) if missing. Idempotent.
   - `listConversations(subject)` → `ConversationSummary[]`, newest last
     message first, inbox always first.
   - `getConversation(id, subject)` → summary, or `null` when the
     conversation doesn't exist or `subject` isn't a member.
   - `listMessages(conversationId, { after, limit })` → ascending by seq.
   - `latestSeq(conversationId)` → number (0 when empty).
   - `appendMessage({ conversationId, sender, clientId, text })` →
     `{ message, created }`, in one transaction: if the client ID exists with
     the same conversation and text, return it with `created: false`; if it
     exists otherwise, throw a `ClientIdConflict`; else insert, then move the
     sender's marker to the new seq.
   - `markSeen(conversationId, member, upTo)` → the new marker, computed with
     `nextSeenUpTo` from `shared`. Updates `seen_at` only when the marker
     moves.
   - `unreadFor(conversationId, member)` → messages above the member's marker
     not sent by that member, ascending.
   - `createClaudeToken(ownerSubject)` → `{ id, token, createdAt }`. The token
     is `stl_` plus 32 random bytes in base64url. Store only the SHA-256 hex
     of the token. Bind it to the owner's inbox (`ensureInbox` first).
   - `resolveClaudeToken(token)` → `{ tokenId, ownerSubject, conversationId }`
     or `null` when unknown or revoked. Compares hashes, updates
     `last_used_at`.
   - `listClaudeTokens(ownerSubject)`, `revokeClaudeToken(ownerSubject, id)`
     (sets `revoked_at` once; revoking someone else's token is `null`).
   IDs for conversations and tokens are `crypto.randomUUID()`. Times are
   `clock().toISOString()`.

## Acceptance

Tests in `store.test.ts` against `:memory:` with a fixed clock cover:

- the same client ID twice stores one row and returns `created: false`; a
  client ID reused with different text throws `ClientIdConflict`;
- `UPDATE messages …` and `DELETE FROM messages …` run directly against the
  database both throw;
- `markSeen` never lowers the marker, clamps to the latest seq, and leaves
  `seen_at` alone when nothing moves;
- sending moves the sender's own marker;
- the race in messages-and-seen.md: read unread (#1 to #4), append #5, mark
  seen up to #4, and `unreadFor` returns only #5;
- `ensureInbox` twice gives one inbox, with members `subject` and `claude`;
- `getConversation` returns `null` for a non-member;
- the token row holds a hash and never the token; a revoked token resolves to
  `null`; one owner can't revoke another's token;
- `listConversations` unread counts.

`npm run typecheck && npm run lint && npm test` pass.

## Outcome (2026-10-09)

Done in commit `a83dcc9`, with 30 store tests. A client-ID replay must
match conversation, sender and text, which is stricter than the brief; any
other reuse is a `ClientIdConflict`.

Additions beyond the brief:

- a `NotAMember` error (answered as 500);
- `seenUpTo()` and an optional `since` on `listMessages`;
- `databasePath()`;
- `migrate()` refuses a database newer than the code.

`openDb` runs the migrations. `listConversations` orders by the last
message's seq, with empty conversations last.

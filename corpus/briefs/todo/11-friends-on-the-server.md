# Task 11: Friends on the server

## Context

Phase 2 starts here. Friends sign in with Ward, find each other, and start
one-to-one or group chats. The message, seen and append-only rules don't
change: the routes from brief 05 already serve any conversation the caller is
a member of. This brief adds people, conversation creation and the contract
for both.

**Before starting**, check [open-questions.md](../../wiki/open-questions.md):
"Should friends get an Ideas inbox?" must be answered. If it is still open,
stop and ask the owner. The answer changes step 4.

Rules: [messages-and-seen.md](../../wiki/messages-and-seen.md). The Claude
boundary in [decisions.md](../../wiki/decisions.md) must still hold: no
friend conversation is ever reachable with a Claude token.

## Files you OWN

```
shared/src/model.ts  shared/src/api.ts  shared/src/*.test.ts   (additions only)
server/src/db/migrations.ts   (migration 2)
server/src/store.ts  server/src/store.test.ts   (additions)
server/src/routes/conversations.ts  server/src/routes/conversations.test.ts
server/src/routes/claude.test.ts   (one regression test)
README.md   ("Inviting a friend" section)
```

## Files you must NOT touch

`web/`, `cli/`, `corpus/`, `server/src/app.ts`, `server/src/ward/`.

## What to do

1. **Contract.** `Person` `{ subject, displayName }`. Routes, Ward auth:
   - `GET /api/people` → every account except the caller, by display name.
     Everyone in `accounts` has signed in with a Satchel grant, so this is
     the friend list.
   - `POST /api/conversations` with a body that is either
     `{ kind: "direct", with: subject }` or
     `{ kind: "group", title, members: subject[] }` (title 1 to 80
     characters, 2 to 20 other members, no duplicates, not the caller) →
     `{ conversation: ConversationSummary }`.
2. **Migration 2.** `conversations.direct_key TEXT UNIQUE`: the two subjects
   of a direct conversation, sorted and joined with a space. Null for other
   kinds.
3. **Store.** `listPeople(subject)`; `createDirect(a, b)` returning the
   existing conversation when the pair already has one (`created: false`);
   `createGroup(creator, title, members)`. Both add every member with marker
   0. Membership is fixed at creation in phase 2; adding or leaving is
   later.
4. **Inboxes.** Apply the owner's answer to the open question (for example:
   `ensureInbox` only for the owner, or hidden until Connect Claude). Update
   [open-questions.md](../../wiki/open-questions.md) and
   [decisions.md](../../wiki/decisions.md) through the corpus completion step.
5. **Routes** in `conversations.ts`: the two above. Unknown subjects in
   `with` or `members` → 400 `invalid_request`. Direct → 201 when created,
   200 when it already existed.
6. **README "Inviting a friend".** The owner's steps in production Ward's
   console: create the account (or open Satchel's public registration with a
   baseline role), then grant the account a role on `satchel`. Any role
   works; Satchel has no roles of its own. The friend appears in
   `/api/people` after their first sign-in.

## Acceptance

Tests with three accounts A, B, C:

- people lists the others, never the caller;
- A starts a direct chat with B twice and gets the same conversation; B
  starting one with A gets it too;
- A creates a group with B and C; all three see it in their list; a fourth
  account D gets 404 on its messages;
- invalid group bodies (no title, one member, duplicate, the caller listed,
  unknown subject) → 400;
- unread counts and seen markers per member in a group;
- regression: A's Claude token returns nothing from the direct or group
  chat on any `/claude/*` route.

`npm run typecheck && npm run lint && npm test` pass.

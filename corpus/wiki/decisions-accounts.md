---
summary: Decisions about accounts made after the 2026-10-13 sign-in decision in decisions.md; so far, why a username can change (2026-11-19) and what shows after a rename.
updated: 2026-11-19
---

# Account decisions

## A username can change
_2026-11-19, ward-auth 1.1.0._ The rename route stays on and Settings has a Change username field. Nothing in Satchel is keyed by the name: messages, conversations, members, seen marks, push subscriptions and Claude tokens all hang on the account's subject, and `accounts.display_name` is rewritten from the session on every `/api/*` request (`server/src/plugins/auth/guard.ts`). A rename therefore shows the new name everywhere at once, past messages included, to everyone who sees it. The library refuses a name another user holds or one that reads the same (`AIice` against `alice`) as `username_taken`. Rejected: `allowRename: false`, which was only needed if the name were a key.

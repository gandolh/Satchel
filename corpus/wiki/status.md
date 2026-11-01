---
summary: Snapshot as of 2026-10-28. Briefs 01-18 built and committed; 17 (Android share target) and 18 (Claude replies in the inbox) wait on phone checks, and 18 left one owner question (should a reply mark seen?); nothing deployed — the owner's steps are in docs/owner-setup.md. Production is the root of satchel.<domain> since brief 15. 577 tests. One line per brief and the waves they ran in (phase 1 Ideas inbox, phase 2 friends).
updated: 2026-10-28
---

# Status

## Where things stand

All 14 briefs are built, reviewed and committed (2026-10-09), and nothing is
deployed. The server signs in through Ward and serves the Ideas inbox, the
Claude routes and friend chats. Live updates come over a WebSocket and push
notifications over Web Push. The `satchel` CLI reads the inbox. The web app is
an installable PWA. The container builds, and vps-deploy has the stack.

On 2026-10-13 brief 26 (in Ward's corpus) moved sign-in to local accounts with
a "Sign in with Ward" button; see [decisions.md](decisions.md). The test suite
is at 534 tests after it (the old Ward guard's tests went with it).

Each phase got a three-finder review followed by fix rounds; see `log.md`.
The test suite is at 538 tests.

On 2026-10-22 [brief 15](../briefs/done/15-served-at-the-root-of-satchel-domain.md)
moved production to the root of its own host, `satchel.<domain>`, with the API
on the same host (`vps-deploy` brief 16 carries the routes). The test suite
is at 536 tests.

On 2026-10-28 [brief 17](../briefs/done/17-android-share-target.md) gave
Android's share sheet a Satchel entry: a GET `share_target` opens the Ideas
inbox with the shared text or link in the composer, unsent. Checked in
headless Chrome; the share sheet itself is an owner step on the phone, listed
in the brief. The test suite is at 554 tests.

The same day [brief 18](../briefs/done/18-claude-replies-in-the-inbox.md)
let Claude answer in the Ideas inbox: `satchel reply <n> "text"` posts
`Re #n: text` through `POST /claude/messages`, live and as a push to the
owner. A reply leaves Claude's seen marker alone, against the brief's "follow
the existing rule", to keep the two-call read's guarantee; that is the one
question in [open-questions.md](open-questions.md). After the next deploy,
`npm run build` here updates the linked CLI. The test suite is at 577 tests.

What's left is the owner's: the steps in
[docs/owner-setup.md](../../docs/owner-setup.md) (register the app in
production Ward, store the keys, deploy, link the CLI, add the CLAUDE.md
line, and invite friends with the `member` role). Open follow-ups live in
`todos/` and [open-questions.md](open-questions.md).

The repository is the owner's
`Satchel`. Commits are local on
`main`; the owner pushes.

## Briefs

Phase 1, the Ideas inbox:

- 01 [Workspace scaffold](../briefs/done/01-workspace-scaffold.md). done 2026-10-09.
  Workspaces, pins, placeholders, dev proxy for the API and Ward.
- 02 [Shared contract](../briefs/done/02-shared-contract.md). done 2026-10-09. zod
  schemas for every phase-1 route, limits, seen rules.
- 03 [Storage](../briefs/done/03-storage.md). done 2026-10-09. SQLite schema,
  append-only triggers, the store, Claude token hashing.
- 04 [Ward sign-in on the server](../briefs/done/04-ward-sign-in.md). done 2026-10-09.
  Copied Ward client, the guard, `buildApp`, `/api/me`, local Ward entries.
- 05 [Conversation routes](../briefs/done/05-conversation-routes.md). done 2026-10-09.
  List, read, send with client IDs, mark seen.
- 06 [Claude routes and tokens](../briefs/done/06-claude-routes-and-tokens.md).
  done 2026-10-09. `/claude/*` behind the bearer token, token create and revoke.
- 07 [The satchel CLI and its guide](../briefs/done/07-satchel-cli.md). done 2026-10-09.
  `guide`, `unread`, `seen`, `history`, config lookup, exit 3.
- 08 [Web shell](../briefs/done/08-web-shell.md). done 2026-10-09. Sign-in and renewal,
  API client, chat list, layout, PWA.
- 09 [Inbox thread and Connect Claude](../briefs/done/09-inbox-thread-and-connect-claude.md).
  done 2026-10-09. Sending, ticks, "Seen", Retry, the token screen.
- 10 [Go live](../briefs/done/10-go-live.md). done 2026-10-09, not deployed. Dockerfile, compose,
  vps-deploy stack, the owner's setup steps.

Phase 2, friends:

- 11 [Friends on the server](../briefs/done/11-friends-on-the-server.md).
  done 2026-10-09. People, direct and group chats; the Ideas inbox is owner-only.
- 12 [Live updates](../briefs/done/12-live-updates.md). done 2026-10-09. WebSocket at
  `/api/live`, polling as fallback.
- 13 [Friend chats in the web app](../briefs/done/13-friend-chats-in-the-web-app.md).
  done 2026-10-09. New chat, groups, "Seen by", unread badges.
- 14 [Push notifications](../briefs/done/14-push-notifications.md). done 2026-10-09.
  VAPID, subscriptions, the Notifications switch.
- 15 [Served at the root of satchel.<domain>](../briefs/done/15-served-at-the-root-of-satchel-domain.md).
  done 2026-10-22. Production on its own host; the CLI's default URL follows.
- 16 [Base UI for the notifications switch and the group picker](../briefs/done/16-base-ui-controls.md).
  done 2026-10-23. Base UI `Switch` and `Checkbox`; no other hand-built widgets left.
- 17 [Share into Satchel from Android's share sheet](../briefs/done/17-android-share-target.md).
  done 2026-10-28, not deployed. GET `share_target`, the share route, the
  inbox composer prefilled once. Owner step: share from the Android phone.
- 18 [Claude replies in the Ideas inbox](../briefs/done/18-claude-replies-in-the-inbox.md).
  done 2026-10-28, not deployed. `POST /claude/messages`, `satchel reply`,
  pushes from the inbox; a reply marks nothing seen (owner to confirm).

## Order

Each wave needs the one before it; briefs in one wave own disjoint files.

1. 01
2. 02
3. 03
4. 04
5. 05 and 06
6. 07 and 08
7. 09
8. 10 (ends with owner steps: deploy, `npm link`, token, CLAUDE.md line)
9. 11
10. 12
11. 13
12. 14
13. 15 (with `vps-deploy` brief 16)
14. 16
15. 17 and 18 (independent)

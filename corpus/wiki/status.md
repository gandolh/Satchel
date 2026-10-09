---
summary: Snapshot as of 2026-10-09. Phase 1 in progress — briefs 01 to 04 done (scaffold, contract, storage, Ward sign-in), 05 and 06 next; the repo is gandolh/Satchel. One line per brief, and the waves they run in (phase 1 Ideas inbox, phase 2 friends).
updated: 2026-10-09
---

# Status

## Where things stand

The design was settled in conversation on 2026-10-09 (two artifact
revisions; see [overview.md](overview.md)) and recorded in
[decisions.md](decisions.md). The corpus and all briefs were written the same
day, and the backlog run started that afternoon. The server signs in through
Ward, stores messages, and answers `/api/me`; the routes, CLI and web app
come next. The repository is the owner's [gandolh/Satchel](https://github.com/gandolh/Satchel) on
GitHub, cloned into this directory on `main` on 2026-10-09; its only commit
is GitHub's initial one (`.gitignore`, MIT `LICENSE`, `README.md`).

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
- 05 [Conversation routes](../briefs/todo/05-conversation-routes.md). todo.
  List, read, send with client IDs, mark seen.
- 06 [Claude routes and tokens](../briefs/todo/06-claude-routes-and-tokens.md).
  todo. `/claude/*` behind the bearer token, token create and revoke.
- 07 [The satchel CLI and its guide](../briefs/todo/07-satchel-cli.md). todo.
  `guide`, `unread`, `seen`, `history`, config lookup, exit 3.
- 08 [Web shell](../briefs/todo/08-web-shell.md). todo. Sign-in and renewal,
  API client, chat list, layout, PWA.
- 09 [Inbox thread and Connect Claude](../briefs/todo/09-inbox-thread-and-connect-claude.md).
  todo. Sending, ticks, "Seen", Retry, the token screen.
- 10 [Go live](../briefs/todo/10-go-live.md). todo. Dockerfile, compose,
  vps-deploy stack, the owner's setup steps.

Phase 2, friends:

- 11 [Friends on the server](../briefs/todo/11-friends-on-the-server.md).
  todo. People, direct and group chats. Needs the friends-inbox answer.
- 12 [Live updates](../briefs/todo/12-live-updates.md). todo. WebSocket at
  `/api/live`, polling as fallback.
- 13 [Friend chats in the web app](../briefs/todo/13-friend-chats-in-the-web-app.md).
  todo. New chat, groups, "Seen by", unread badges.
- 14 [Push notifications](../briefs/todo/14-push-notifications.md). todo.
  VAPID, subscriptions, the Notifications switch.

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

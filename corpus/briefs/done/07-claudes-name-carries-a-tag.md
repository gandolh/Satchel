# Brief 07: Claude's name carries a tag

**Depends on:** brief 06 (the username rename is on). **Runs after:** 06.

**Before you start:** run `brief-board guide` (the repo's `CLAUDE.md` says so).

Promoted 2026-11-19 from the todo [a-person-can-take-the-name-claude](../../todos/a-person-can-take-the-name-claude.md), in the owner's grill: "Label Claude apart".

## Context

Claude's member shows the display name "Claude" (`CLAUDE_DISPLAY_NAME`, `shared/src/limits.ts`). Since brief 06 anyone can rename themselves, so a friend can be called "Claude" (or a look-alike), and ward-auth's look-alike check compares people with people only. The real Claude lives only in the owner's Ideas inbox; a friend chat shows "Claude has no access to this chat".

## Decisions

- **A tag on the real Claude, everywhere its name shows:** the chat list's Ideas inbox row, the thread header, a sender name above Claude's bubbles if one shows, and any member list. The tag reads "AI" (Slack's APP and Discord's BOT tags are the convention), in the thread's existing pill style, with no colour that only colour can tell apart. A person called Claude gets no tag.
- The tag is decided by the member id (`CLAUDE_MEMBER`), never by the name.
- Glossary: add **AI tag** (the mark on Claude's name) to `corpus/wiki/glossary.md`.

## Files you OWN

- `web/src/` where member names render (chat list, thread header, thread bubbles, member lists) and their tests.
- Corpus: `corpus/wiki/glossary.md`, `corpus/wiki/status.md`, `corpus/log.md`.

## Files you must NOT touch

- `server/`, `shared/` (the name stays "Claude"), `cli/`, `server/vendor/`, `web/vendor/`.

## What to do

1. Find every place a member's name renders; add the tag for `CLAUDE_MEMBER`.
2. Tests (static markup, roles and text): Claude's row and header carry the tag; a person whose display name is "Claude" has none.
3. Shots of the chat list and the Ideas inbox at 1280 light and 390 dark; read them for clipping.

## Acceptance

- [ ] The tests above pass; `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step: the web deploy for the `satchel` stack (`node cli.ts satchel deploy` from vps-deploy; with brief 06, `all`).

## Outcome

Built 2026-11-19 in commit f518642. `AiTag` (`web/src/layout/AiTag.tsx`) is an "AI" pill in the thread's pill style, read by screen readers as "(AI)". `hasClaude(conversation)` in `web/src/chats/conversation.ts` decides by `CLAUDE_MEMBER` among the members, never by name. The tag shows after the name in the chat list's Ideas inbox row, in the thread header (`ScreenHeader` takes a `tag`), and after a sender name above a bubble when the sender is `CLAUDE_MEMBER` (that name only shows in groups, which Claude is not in, so it is wiring for later). No member list shows Claude today. Tests in `web/src/chats/AiTag.test.ts`: Claude's row and header carry the tag, a person called "Claude" gets none. Shots of the chat list and inbox at 1280 light and 390 dark were read, no clipping. Owner step: `node cli.ts satchel all` from vps-deploy (brief 06 still waits on the server part).

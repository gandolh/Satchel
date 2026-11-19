# Brief 06: Linking Ward asks for the password, and a username can change

**Depends on:** Ward's library at the version that adds the look-alike username check (2026-11-19; the dispatch prompt names the wzd_auth commit to vendor from).

**Before you start:** run `brief-board guide` (the repo's `CLAUDE.md` says so).

Filed 2026-11-19 by the controller. The owner's rule of 2026-11-17: an app links or unlinks a Ward account only after the local password is typed again. Ward's library carries the rule from 1.0.0; this app gets it when it vendors the new copy. The same update refuses a new or changed local username that looks like an existing one (Unicode's confusable skeleton: `AIice` against `alice`, `b0b` against `bob`). The owner's answer of 2026-11-19: apps that pass 0.4.0 on this update keep its rename route and get a screen for it.

## Context

This app vendors ward-auth 0.3.1 in `server/vendor/ward` and `web/vendor/ward`. Its code calls the link and unlink at: `web/src/settings/SignInMethods.tsx:169` (link), `:184` (unlink, behind a confirm step); `server/src/plugins/auth/guard.test.ts:363-375`.

What the update changes here:

- `POST /ward/link` and `POST /ward/unlink` take `{ currentPassword }`: 400 `invalid_request` without it, 401 `invalid_credentials` when it is wrong, 429 `too_many_attempts` with `retryAfterSeconds` under the change-password budget. A Ward-only user still gets 409 `no_local_password` on unlink, whatever is sent.
- The browser calls take the password: `link(currentPassword)` / `startWardLink(currentPassword)`, `unlink(currentPassword)` / `unlinkWard(currentPassword)`. The old call shape no longer compiles, so the typecheck finds every call site.
- A link start is held in the server's memory for ten minutes; one still waiting for Ward when the server restarts lands as `?ward_error=invalid_callback` (the words for it exist).
- The username key: a migration at start adds a key column and fills it. Two existing accounts with the same key are both kept and logged once. Nothing to do by hand.
- On the way from 0.3.1: 0.4.0 (the rename route, on by default), 0.5.0 (`usernameFor`), 0.6.0 (migration 4 and disabling an account) and 0.7.0 (`returnTo`). Read each CHANGELOG entry and do what it asks of an app.

## Decisions

- **Both copies in one commit.** The new server copy refuses a link or unlink from an old web copy (400); an old server ignores the new field.
- **The password field sits with its control:** next to the Link button; Unlink already asks to confirm, so the field goes in that confirm step. Labelled as the app labels its other password fields ("Current password" or the app's language), `type="password"`, `autocomplete="current-password"`. A refusal stays on the page: `invalid_credentials` and `too_many_attempts` (with the wait) show beside the field, which keeps focus.
- **A username can change** (the owner, 2026-11-19). The rename route stays on (the library's default since 0.4.0; no `allowRename: false`), and the account settings get a Change username field: `useRenameUser()` / `renameUser(next)`, showing `username_taken` (a look-alike answers the same), `invalid_username` and `too_many_attempts`. Shelfmark's Change username screen is the model.
- **Before the screen, check what is keyed by the name.** Find what this app stores or matches by username (seeds, saved rows, links, streams, mentions). If stored data is keyed by the name, a rename would cut it off: set `allowRename: false` instead, file a todo naming what is keyed, say so in the report, and skip the screen.
- Several people use Satchel and see each other's names: say in the outcome note what others see after a rename (the new name everywhere, or the old one in past messages).

## Files you OWN

- `server/vendor/ward/` and `web/vendor/ward/`: generated, written only by Ward's vendor script.
- The settings code named above, the server's auth plugin options, and their tests; the new Change username component.
- Corpus: `corpus/wiki/status.md`, `corpus/log.md`, the wiki page that describes sign-in.

## Files you must NOT touch

- The wzd_auth repo: read only (its vendor script writes only into this repo). Other features.

## What to do

1. Vendor both copies from the wzd_auth checkout at the commit the dispatch prompt names: `npm run vendor -- <this repo>/server/vendor/ward`, then the same for `web/vendor/ward`, in one commit with the call-site changes.
2. Server tests that POST `/ward/link` or `/ward/unlink` with a session send `{ currentPassword }`. New: link and unlink without it, with a wrong one and with the right one; a linked user still signs in with Ward.
3. The settings UI as decided, with a test that the call carries the password and that a wrong one shows the message.
4. The username check and then the screen (or the todo), as decided. Tests: a rename works and signs in under the new name; a taken name and a look-alike (`AIice` when `alice` exists) answer `username_taken`.
5. Start the app on its dev seed once and read the start log: the username-key migration ran; note any shared-key line.
6. Shots of the settings at 1280 light and 390 dark; read them for clipping.

## Acceptance

- [ ] Both vendored copies at the new version; the tests above pass; `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] The outcome note lists each CHANGELOG entry this app crossed and what it needed, and the username check's finding.
- [ ] End move `ready_for_deploy` with the app's deploy step (server and web both change).

## Outcome (2026-11-19)

Done. `ward-auth` 1.1.0 is vendored in `server/vendor/ward` and `web/vendor/ward` (six files each, `SHA256SUMS` checked). Crossed from 0.3.1:

- **0.4.0** rename route: kept on and used. Settings has a Change username field (`useRenameUser`), with words for `username_taken`, `invalid_username` and `too_many_attempts`.
- **0.5.0** `usernameFor`: not used; first Ward sign-ins keep the library's name handling.
- **0.6.0** migration 4 (`disabled_at`): ran by itself. No `disableUser` call yet.
- **0.7.0** `returnTo`: unused; nothing changes on the login page.
- **1.0.0**: link and unlink take `currentPassword`. The password field sits next to Link Ward and inside the Unlink confirm; a refusal shows beside it and the field keeps focus. Server tests send the password and cover missing (400), wrong (401) and right.
- **1.1.0** migration 5 (`username_skeleton`): ran on a fresh dev database (all five migrations applied, `owner` got its key); no shared-key warning, since there was one user. A look-alike (`AIice` against `alice`) answers `username_taken`, tested.

Username check: nothing is keyed by the name. Messages, conversations, members, seen marks, push subscriptions and Claude tokens hang on the account's subject, and `accounts.display_name` is rewritten from the session on every `/api/*` request. So the screen was built. After a rename everyone sees the new name everywhere, old messages included. Recorded in `wiki/decisions-accounts.md` (the decisions page was at its 200-line cap). Settings' Account card reads the name from the session, so it updates at once; other screens pick it up on their next fetch.

Not done: a real Ward round trip. Shots of Settings (1280 light, 390 dark, error showing) were read; the Ward calls were stubbed. Owner step: `node cli.ts satchel all` from vps-deploy; no step back to an older copy once migration 5 has run.

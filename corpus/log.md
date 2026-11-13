# Log

## [2026-10-09] decision | Design settled

Satchel is a text messenger whose pinned Ideas inbox is a chat with Claude,
plus one-to-one and group chats with friends. The owner chose the house stack
(Fastify + SQLite + React PWA behind Ward) over a Matrix homeserver and over
MLS encryption, cut media, tags and the offline outbox, and replaced the MCP
endpoint with a CLI in the-board's pattern. The one-call "read and mark read"
endpoint became two calls so no message can be lost. Recorded in
[wiki/decisions.md](wiki/decisions.md).

## [2026-10-09] maintenance | Corpus bootstrapped

Wiki spine (overview, architecture, decisions, glossary, status,
open-questions) plus concept pages for messages and seen, Claude access, and
design. `lint.sh` copied from the-board. Research on 2026-10-09 corrected one
assumption: vps-deploy runs every service as a rootless Docker container, not
under pm2, so brief 10 ships a Dockerfile and compose file.

## [2026-10-09] todo | Briefs 01 to 14 filed

Phase 1 (Ideas inbox): 01 to 10. Phase 2 (friends): 11 to 14. Waves in
[wiki/status.md](wiki/status.md). Not filed on the-board yet: the
`brief-board` CLI isn't on PATH, and its `sync` will pick these up once the
repo exists.

## [2026-10-09] maintenance | Repository wired

The owner's `Satchel` (initial commit: Node `.gitignore`, MIT
`LICENSE`, one-line `README.md`) was cloned and its `.git` moved into this
directory, keeping `corpus/` in place. Brief 01 now extends those files
instead of checking for a repository.

## [2026-10-09] decision | The name stays Satchel

The owner named the GitHub repository Satchel, so the open question about
the name is closed. The CLI, paths, Ward app key and stack keep it.

## [2026-10-09] done | Briefs 01 to 04: scaffold, contract, storage, Ward sign-in

The backlog run started with plan-split-dispatch. Commits:

- 01 `1d23546`: workspaces;
- 02 `e6f15a7`: shared contract, 67 tests;
- 03 `a83dcc9`: SQLite store with append-only triggers;
- 04 `d1728de`: Ward guard and `/api/me`, 141 tests in all; wzd_auth
  `d85aeaa` registers Satchel locally.

The controller added `CLAUDE_DISPLAY_NAME` and an `internal` (500) error
code to the contract. Client-ID replays now also match on sender
([wiki/messages-and-seen.md](wiki/messages-and-seen.md)).

Brief 04's live check signed in through the dev proxy and got the owner's
subject. The-board's server was down, so no ticket moves were made. Outcome
notes are in each brief.

## [2026-10-09] done | Briefs 05 and 06: conversation and Claude routes

Run in parallel. Commits: 05 `91721cf` (list, read, idempotent send, mark
seen) and 06 `66e4655` (the `/claude/*` routes behind the bearer token,
plus token create, list and revoke). 186 tests. The server side of phase 1
is complete.

Before wave 6, the controller installed vite-plugin-pwa 1.3.0, workbox-window,
the fontsource families, and the CLI's dev link to the server (`992a2f2`), so
briefs 07 and 08 don't race on the lockfile. vite-plugin-pwa 2.0.0 was
skipped as under two weeks old.

## [2026-10-09] done | Briefs 07 and 08: the satchel CLI and the web shell

Run in parallel. Commits: 07 `be07955` (CLI and guide) and 08 `ba058e5`
(sign-in and renewal, router, layout, chat list, PWA). 245 tests.

- **Live checks.** Brief 08's browser checks ran against local Ward: sign-in,
  renewal, sign-out, no-access, installability.
- **Duplicate zod.** Brief 08 surfaced two zod copies; `3519545` pins 4.5.4
  tree-wide.
- **The owner said "commit freely".** From brief 07 on, a brief is committed
  as soon as its own gate passes, without waiting for its wave partner.

## [2026-10-09] done | Briefs 09 and 10: inbox thread, Connect Claude, deployable

Commits:

- 09 `9084340`: the thread with sending, retries, ticks and "Seen", plus
  Connect Claude;
- 10 `134de77` and vps-deploy `455682e`: Dockerfile, compose, the stack and
  the owner's setup steps.

255 tests. Brief 10 ran in parallel with 09, since their files were
disjoint. The controller fixed the README's CLI exit codes. Phase 1 is
built and waits on the owner's deploy steps.

## [2026-10-09] decision | The Ideas inbox is owner-only

Asked before brief 11, the owner chose owner-only: only accounts with the
`admin` role on Satchel get an inbox and may create Claude tokens. Recorded
in [wiki/decisions.md](wiki/decisions.md); brief 11 now implements it.

## [2026-10-09] maintenance | Phase-1 review and fixes

Three read-only finders reviewed `e02aeaf..HEAD`: security (opus), server and
storage (sonnet), web, CLI and docs (sonnet). None found anything critical.
They found only Minor issues; the controller promoted two to Important
(the CLI exit code when the container is down, and a possible sign-in
redirect loop). Fixed in two lane-disjoint batches:

- `17b1603`, CLI and web:
  - exit 3 for a stalled body and for 502/503/504;
  - inline config comments, and the token sent over https only;
  - no redirect after a refresh that still 401s;
  - a retry for a failed seen marker;
  - the README reads the token without echo.
- `d15dc90`, server:
  - cross-site writes refused;
  - tokens revoked when a grant is lost;
  - compose pins HOST, PORT and DATA_DIR;
  - startup failure handling;
  - the rollback test tightened. `app.ts` gained a `publicOrigin` dependency.

276 tests. The rules are in [wiki/architecture.md](wiki/architecture.md) and
[wiki/claude-access.md](wiki/claude-access.md).

Accepted and not fixed:

- Revoking on a lost grant is lazy.
- Ward's own same-origin check is stricter (it checks both headers whenever
  both are present); Satchel's is equivalent for real browsers.
- Something on the machine polls `127.0.0.1:8807/api/board`. It is not
  Satchel's.

## [2026-10-09] done | Brief 11: friends on the server

Commit `0a642f2`. Covers people, direct and group chats, migration 2, and the
owner-only Ideas inbox. The controller added token revocation for accounts
without `admin`. 339 tests. Brief 13 was amended with the no-access fix this
brief surfaced: only a 403 from `/api/me` locks the app.

## [2026-10-09] done | Brief 12: live updates over WebSocket

Commit `2879ee2`, 392 tests. One socket per tab, with origin-checked
upgrades and expiry at the token's `exp`; polling stays as the fallback.
The controller pinned `ws` 8.21.3. The lingering-socket concern is captured
as `todos/recheck-ward-session-on-socket-ping.md` (done in brief 26, since removed).

## [2026-10-09] done | Brief 13: friend chats in the web app

Commit `e388001`, 400 tests. Adds New chat, group threads and the no-access
fix. The controller moved New chat into `AppShell`'s main pane. Follow-up
captured: `todos/hide-ungranted-accounts-from-people.md` (resolved later the same day and removed).

## [2026-10-09] done | Brief 14: push notifications; every brief is built

Satchel `35c53ea` and vps-deploy `fe6d6f3`, 497 tests. The controller
declared the workbox packages that `sw.ts` imports. A live round-trip
through Chrome's push service passed. All 14 briefs are done; a final
review of phase 2 is running.

## [2026-10-09] maintenance | Phase-2 review and fixes; the run is complete

Three finders reviewed `329d461..HEAD` (security on opus, server and web on
sonnet). They found nothing critical. Four findings were Important: a removed
friend kept getting push previews; a shared browser kept the previous
account's pushes; a socket that died during sleep looked live; and the new
socket cap could evict tabs in a loop. Fixed in:

- `3f89992`, web:
  - reconnect after five seconds away;
  - sign-out unsubscribes, and sign-in re-binds;
  - Enter in New chat no longer submits an empty group;
  - a retryable error for the notifications check.
- `8329a2c`, server:
  - lost-grant lockout with `accounts.active` (migration 4);
  - push subscriptions deleted and inactive accounts skipped;
  - at most ten sockets per account (close code 4002, and the client
    doesn't auto-reconnect after it);
  - trailing-dot push hosts refused;
  - the subscription cap on rebind;
  - `VAPID_SUBJECT` validation.

538 tests. The lockout resolved
`todos/hide-ungranted-accounts-from-people.md`, which was removed.

Accepted and not fixed:

- The lockout and socket expiry only happen at the person's next request
  (the socket re-check stays a todo).
- A Ward-disabled account is a 401, not a 403, so it stays listed.
- Safari may penalise pushes suppressed while a chat is focused.

Outside this run, commit `63fcf74` rewrote the README as a landing page and
moved the setup steps into `docs/` (`owner-setup.md`, `getting-started.md`,
`architecture.md`).

All 14 briefs are done. Nothing is deployed; the owner's steps are in
`docs/owner-setup.md`.

## [2026-10-13] decision | Local accounts, with Ward as a second way in (brief 26)

Satchel signs people in itself now: the vendored `ward-auth` 0.2.0 plugin
replaces `server/src/ward/`, the web app has its own login page with a "Sign in
with Ward" button, and Settings can link and unlink Ward and set a local
password. Every `accounts.subject` became a local user with that id, linked to
it (owner = the account with an Ideas inbox; everyone else `member`). The CLI's
agent tokens are untouched. Two calls recorded in
[wiki/decisions.md](wiki/decisions.md): the lost-grant lockout left the guard
(the Ward grant now only ends a Ward-originated session), and an open live
socket re-checks its session every 10 seconds, because a tab with a live socket
makes no HTTP requests and the 30-second Ward check would otherwise never run.
That resolved `todos/recheck-ward-session-on-socket-ping.md`, which was removed.
Not deployed. Docs outside the corpus (`README.md`, `docs/`) still describe the
old Ward-only sign-in apart from `docs/getting-started.md`'s environment table.

## 2026-10-22: brief 15, Satchel at the root of satchel.<domain>

The owner asked for Satchel on its own host, with the imbatranimOS desktop,
Postern and Ward: a messenger counts as a mailbox under the estate's rule. The
app needed no code change, since its base was already the build's
`SATCHEL_BASE`; `vps-deploy` brief 16 builds it with `/`. The CLI's default
URL moved to `https://satchel.<domain>/satchel-api`. The owner's setup steps
were rewritten for the new host, and the step that redeployed Ward's UI for its
login allowlist went, because Ward retired that allowlist on 2026-10-13.
Checked: typecheck, lint, 536 tests, and a `SATCHEL_BASE=/` build. brief-board
is down (since 2026-10-13), so progress is recorded here only.

## [2026-10-23] todo | Brief 16 filed: Base UI for the switch and the group picker

The owner asked for Base UI in the apps that still hand-build their widgets.
Satchel has two: the Notifications switch and the New group checkboxes.
Brief 16 moves them to Base UI `Switch`
and `Checkbox`.

## [2026-10-23] done | Brief 16: Base UI for the switch and the group picker

The Notifications switch is Base UI's `Switch` and the New group rows use its
`Checkbox` (`1bc70c0`). The switch looks exactly as before; the checkbox is
drawn by our CSS, close to the native one. The decision is in
[decisions.md](wiki/decisions.md); details are in
brief 16. brief-board is down (since
2026-10-13), so it isn't on the board.

## [2026-10-28] decision | Both phones, Android first; Claude may reply in the inbox

The owner answered both open questions. Satchel is used on Android and iPhone:
Android is the main phone, features are tested there, and it gets a share
target; the iPhone must keep working but gets no share sheet (no native
wrapper). And Claude may reply in the Ideas inbox through a `satchel reply`
command; its token stays bound to the inbox. Both recorded in decisions.md.
Briefs for the share target and the reply are to be written.

## [2026-10-28] todo | Briefs 17 and 18: an Android share target, Claude's replies

17 adds a GET `share_target` to the
manifest and a share route that opens the Ideas inbox with the shared text or
link in the composer, unsent; Safari ignores it, so the iPhone stays as it is.
18 adds `POST /claude/messages`
(the conversation from the token, the sender `claude`, live and push like any
message) and `satchel reply <n> <text>`, with the guide saying when to use it.

## [2026-10-28] done | Brief 17: share into Satchel from Android's share sheet

The manifest has a GET `share_target` at `<base>share` (`85b5087`). A share
becomes one message (the text, then the link on its own line unless the text
holds it; the title only without text), waits in the tab's sessionStorage
through sign-in, and lands in the Ideas inbox's composer, unsent. The address
becomes the thread's, so a reload doesn't paste it again. A friend's share goes
to the first chat they open. Checked in headless Chrome against the built app
and a scratch API: Chrome parsed the manifest with no errors and the share
target, and the share flows passed. The Android share sheet and the iPhone
are owner checks, listed in brief 17.
554 tests. brief-board is down (since 2026-10-13), so it isn't on the board.

## [2026-10-28] done | Brief 18: Claude replies in the Ideas inbox

`POST /claude/messages` and `satchel reply <n> [text]` (`e03348f`). The
conversation comes from the token and the sender is `claude`; the owner sees
the reply live and gets a push (the inbox used to push nothing). `satchel
history` marks Claude's replies, and the guide has rule 8 on when to reply.
One call against the brief's wording: a reply leaves Claude's seen marker
alone, though a person's send moves theirs. Moving it would mark seen a
message sent while Claude was writing, which the locked two-call read rules
out. Recorded in decisions.md and left as the open question in
open-questions.md. Checked with 577 tests, and with the built CLI against a
scratch API while the owner's thread was open in headless Chrome: the reply
arrived over the socket in about half a second. Push on the Android phone is
an owner step, listed in brief 18.
brief-board is down (since 2026-10-13), so it isn't on the board.

## [2026-10-28] decision | Claude's reply leaves its seen marker alone, confirmed

The owner confirmed brief 18's call: a `satchel reply` does not move Claude's
seen marker; only `satchel seen` does. open-questions.md is empty again.

## [2026-10-31] maintenance | README status counts briefs 01-18

A README refresh pass with the readme-docs standard. The README already described the share target and Claude's replies, but its status still said "all fourteen briefs are done"; it now names briefs 01-18 and what is untested on a phone, as [status.md](wiki/status.md) does. The images were kept: briefs 15-18 moved the deploy to the root of `satchel.<domain>`, put Base UI under the notifications switch and the group picker, and added two features no image shows, so the screens pictured are unchanged. Checked: `npm install`, `npm run seed -w @satchel/server` with `SEED_USERNAME`, `SEED_PASSWORD` and `SEED_ROLE=admin` on a scratch `DATA_DIR`, and `npm run dev` answering on `/satchel/`.

## [2026-11-02] maintenance | Briefs reset

Part of an estate-wide reset. The eighteen briefs in `briefs/done/` are folded
into the wiki and deleted; brief numbering restarts at 01. The old briefs read
like the grilling that fed the first corpus. The last commit that held them is
`6671a58`: read one with
`git show 6671a58:corpus/briefs/done/12-live-updates.md`. Brief numbers in the
entries above refer to that set.

Most was already in the wiki. [architecture.md](wiki/architecture.md) gained
the push endpoint rule and its known gaps, [design.md](wiki/design.md) the
share target's hand-off and the service worker's update rule, and the pages
cite dates instead of Satchel's, Ward's or vps-deploy's brief numbers.
[status.md](wiki/status.md) is a per-area snapshot instead of a brief list.
Code comments no longer cite brief numbers.


## [2026-11-10] todo | Four briefs queued: house style, Base UI conventions, Tailwind, code structure

The owner's estate calls of 2026-11-09 (Base UI 1.9.0 everywhere, whole apps on Tailwind v4, the researched conventions enforced) became four briefs, 01-04, in `briefs/todo/`. Satchel needs no Base UI bump: `web/package.json` pins 1.9.0 and the lockfile resolves it. Measured on a scratch copy on 2026-11-10 (no file in the repo was touched):

- Prettier 3.8.1 churn over 113 files: 120 columns touches 231 old lines in 49 files, 125 touches 244 in 40, 130 touches 315 in 40.
- `verbatimModuleSyntax` costs 0 errors; `erasableSyntaxOnly` costs 10, all constructor parameter properties.
- The six typed lint rules find 15 (2 floating promises, 4 switches, 9 test assertions); `!` appears 13 times; six `process.env` reads sit outside `config.ts`.
- `npm test` has no `pretest`, and `cli` tests import `@satchel/server/testing` from `server/dist`: with `server/dist` removed that file fails at import, and with a stale one it tests old code.
- No response schema has a zod `.transform()`, so the provider's serializer trap doesn't apply; the one transform is in a query schema.
- `web/` is 10 stylesheets, 1,290 lines, 27 tokens (11 switch for dark mode), and builds to 20,195 bytes of CSS.

Open questions for the grilling are in the briefs' decision lists: the store's split, validation before authorization on three routes, a type scale, the 900 px breakpoint kept in two places, and the two inline confirms.

## [2026-11-10] revise | Briefs 01-05 follow the owner's grilling

The owner's answers and the technical calls of 2026-11-10 are folded into the
briefs. 01: `house-style` is vendored (a copy with a version header and a
`house-style:sync` script), so no git dependency and no Dockerfile change;
Prettier width 120 (231 lines in 49 files, already measured) is the estate
width and Satchel's own least; `!` is a warning in tests; `switch-exhaustiveness-check`
sets `considerDefaultExhaustiveForUnions`, so the four `messages.ts` findings
should fall away. 02: the two inline confirms stay (Q58); parity is "close
enough" (Q19). 03: a Light / Dark / System switch, light on a first visit, the
dark tokens under `data-theme`, kept on the device (Q18); the 13 type sizes
become a named scale (Q62); Satchel is fifth in the order. 04: the store
stays whole in `db/` (Q54); validation before authorisation is accepted
(Q52); the entry rename changes the Dockerfile's `CMD` and needs no
vps-deploy edit (Q1); the live socket is a recorded exemption (Q53); the error
handler keeps Satchel's body (Q43). New brief 05, a redesign with Hallmark on
the estate board (Q39). No measurement changed.

## [2026-11-11] build | The house style and the quality harness

Brief 01 built. Satchel holds a vendored `house-style` 1.0.0, is formatted by
Prettier at width 120 in one commit (no bundle difference), has
`verbatimModuleSyntax` and `erasableSyntaxOnly` on (eight constructors changed),
the house ESLint config with 0 errors, knip, dependency-cruiser and the two
checkers (`--warn-only`) in `check:conventions`, `pretest`, a root `CLAUDE.md`
and `.claude/rules/`. `jose` and `ws` are gone from the server. `check` takes
about 51 s, `check:fast` about 8 s. Owner steps: `git config
blame.ignoreRevsFile .git-blame-ignore-revs`, and the deploy. See
[decisions-tooling.md](wiki/decisions-tooling.md).

## 2026-11-11: Base UI by the conventions (brief 02)
`Switch` and `Checkbox` moved into `web/src/components/ui/` with static-markup tests; the two callers import them, and the CSS rules `.person__check*` became `.checkbox*`. check-base-ui: rule 3 from 2 to 0; rule 5 stays at 10 (brief 03). Before/after screenshots skipped: sign-in needs a seeded account and the Ward path, which the build run didn't set up.

## [2026-11-11] build | The server in the house code structure (brief 04)

Brief 04 built in 14 commits, `3a9f950` to `7e29b18`. `server.ts` and
`buildApp`, `config.ts` as the only reader of the environment, `plugins/`
(errors, JSON body, auth) wrapped in `fastify-plugin`, `features/` used
through their indexes, the store whole in `db/`, and the contract's zod
schemas declared on every route but the live socket, through
`@fastify/type-provider-zod`. check-structure strict at 0 (21 errors before);
dependency-cruiser at 0 with `no-circular` an error. 608 tests.

The JSON comparison: 169 replies captured through the built app before the
first step and after each one. 160 are byte-identical. Nine changed, all
expected:

- validation before authorisation (decision 5): a friend's revoke with an
  empty id is 400 `invalid_request` (was 403), and with push off a malformed
  subscription, or none, is 400 (was 404). Three replies;
- a POST or DELETE with no body reads "expected object, received null" (was
  "received undefined"): send, seen, Claude's seen and reply, push save and
  delete. Six replies.

No field disappeared, so no leak and no missing schema field. A reply that
fails its response schema is now a 500 `internal`, logged without values
(was a 400 `invalid_request`); tests pin it on the token list.

Shutdown: the live sockets close with 1001 in `preClose` and a client that
doesn't answer is cut after 1 s, so SIGTERM exits 0 in about a second; one
silent client held it 30 s before. The web client reconnects on 1001.
Owner step: `node cli.ts satchel server` from vps-deploy.

## [2026-11-11] decision | Base UI for interactive controls: revisited, now styled with Tailwind

The 2026-10-23 entry in [wiki/decisions.md](wiki/decisions.md) said "styled by our
own CSS" and rejected a styled kit "which would bring Tailwind". The owner's call
of 2026-11-09 changes the first half: Base UI is styled with Tailwind 4, and the
whole web app moved (brief 03). shadcn stays rejected, for its own reason: Base UI
is used directly. The heading is now "Base UI for interactive controls, styled
with Tailwind". [wiki/design.md](wiki/design.md)'s "Theme follows the system. No
toggle in phase 1" is revisited too: a Light / Dark / System switch, light on a
first visit (the owner's Q18).

## [2026-11-11] build | Brief 03: the web app to Tailwind

Tailwind 4.3.5 with `@tailwindcss/vite`; all ten stylesheets gone, one left
(`web/src/styles/index.css`: layer order, fonts in the vendor layer, 27 tokens
plus 4 mixes and 2 shadows in `@theme`, `light-dark()` for both themes, a named
type scale of 11 sizes from 13, `--breakpoint-wide: 900px`). `check-base-ui` runs
strict at 0 errors and 0 warnings; `better-tailwindcss` is on.

Screenshots at 1280 and 390 (light and dark) and 899, 900, 901, before and after:
no change to layout or colour beyond a 1 px line-height drift on a few rows, and
`hover:` no longer sticking on a tap (expected). The comparison found one bug
(the sending and failed bubbles read a shadowed name); fixed. Built size, before
and after: CSS 20.2 kB (4.3 gzip) to 27.1 kB (6.2); JS 370.9 kB (112.6 gzip) to
422.7 kB (129.8), of which `tailwind-merge` is about 9; precache 531 to 589 KiB.

The theme switch: `web/src/settings/theme.ts` (store, `localStorage` key `theme`),
a `RadioGroup` wrapper, an Appearance card on Settings, and a boot script in
`index.html` that also sets the `color-scheme` and `theme-color` metas. Owner
step: `node cli.ts satchel deploy` from vps-deploy.

## [2026-11-13] decision | Redesign direction approved

The owner approved the redesign direction "Clay on graphite" on the estate redesign board, with every question on the board standing as proposed: the side rail from 900 px and the New chat button wording, the clay accent with Rethink Sans, and the direction itself. Brief 05's build starts from that.

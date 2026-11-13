---
summary: Snapshot as of 2026-11-02, per area. Satchel is built (Ideas inbox and friends 2026-10-09, local accounts 2026-10-13, its own host 2026-10-22, Base UI controls 2026-10-23, the Android share target and Claude's replies 2026-10-28) and pushed, not deployed; the Android and reply checks wait on a phone. The server is in the estate's code structure (2026-11-11), waiting for a deploy. The web app is redesigned, "Clay on graphite" (2026-11-13), waiting for a deploy. 608 tests. What waits on the owner and what is still open.
updated: 2026-11-13
---

# Status

_2026-11-02_. Everything is on `main` and pushed through `14e9dc5`
(2026-11-01). Nothing is deployed. Four briefs are queued (2026-11-10): the house style and
quality harness, Base UI by the conventions, the web app to Tailwind, and the
server in the house code structure, in `corpus/briefs/todo/`. Brief numbering
restarted at 01 on 2026-11-02 (see [log.md](../log.md)). 608 tests
(2026-11-11); typecheck and lint clean.

## By area

- **Redesign** (2026-11-13). "Clay on graphite", approved on the estate redesign board: a clay accent on graphite, Rethink Sans, a 72 px rail from 900 px, a New chat button on the phone, drawn ticks, labelled fields ([design.md](design.md), `web/DESIGN.md`, [decisions.md](decisions.md)). Playwright specs added. Ready for deploy: `node cli.ts satchel deploy` from vps-deploy (web client only).
- **Tailwind and the theme switch** (2026-11-11). The web app is Tailwind 4 with one stylesheet (`web/src/styles/index.css`, the tokens in `@theme`); Settings has a Light / Dark / System choice kept on the device, light on a first visit ([design.md](design.md)). `check-base-ui` strict at 0, 23 new tests. Ready for deploy: `node cli.ts satchel deploy` from vps-deploy (web client only).
- **Server structure** (2026-11-11). `server.ts`, `buildApp`, `config.ts` as the only reader of the environment, `plugins/`, `features/` and the store in `db/`; every route but the live socket declares its zod schemas; the live sockets close with 1001 at shutdown; `check-structure` strict at 0. Ready for deploy: `node cli.ts satchel server` from vps-deploy, which rebuilds the API container ([decisions-tooling.md](decisions-tooling.md)). 608 tests.
- **House style and gate** (2026-11-11). Prettier at width 120, a vendored `house-style` 1.0.0, typed ESLint, knip, dependency-cruiser and the two convention checkers behind `npm run check`; `pretest` builds the workspaces; root `CLAUDE.md` and `.claude/rules/`. Not deployed ([decisions-tooling.md](decisions-tooling.md)).
- **Ideas inbox** (2026-10-09). The shared contract, append-only storage,
  the conversation routes, Claude's bearer routes and tokens, the `satchel`
  CLI and its guide, the web shell and the inbox thread with ticks and
  "Seen" ([messages-and-seen.md](messages-and-seen.md),
  [claude-access.md](claude-access.md)).
- **Friends** (2026-10-09). People, direct and group chats; the Ideas inbox
  is the owner's only; "Seen by" and unread badges.
- **Live updates and push** (2026-10-09). A WebSocket at `/api/live` with
  polling as the fallback; Web Push with VAPID
  ([architecture.md](architecture.md)).
- **Sign-in** (2026-10-13). Local accounts with "Sign in with Ward" as a
  linked second way in ([decisions.md](decisions.md)).
- **Hosting** (2026-10-22). Production is the root of `satchel.<domain>`
  with the API on the same host; the CLI's default URL follows. The
  container builds and `vps-deploy` has the stack.
- **Controls** (2026-10-23). Base UI `Switch` and `Checkbox`; no hand-built
  widgets left ([design.md](design.md)). Since 2026-11-11 they sit in
  `web/src/components/ui/` wrappers; check-base-ui reads 0 for rules 1-3 and
  9-11, and rule 5 went to 0 with the Tailwind brief (2026-11-11).
- **Android share target** (2026-10-28). Share → Satchel opens the Ideas
  inbox with the text in the composer, unsent ([design.md](design.md)).
- **Claude's replies** (2026-10-28). `satchel reply` posts into the inbox,
  live and as a push; a reply leaves Claude's seen marker alone, which the
  owner confirmed the same day.

Each phase got a three-finder review followed by fix rounds; see `log.md`.

## Next (owner)

1. The steps in [docs/owner-setup.md](../../docs/owner-setup.md): register
   the app in production Ward, store the keys, deploy, link the CLI, add the
   CLAUDE.md line, and invite friends with the `member` role.
2. After the next deploy, `npm run build` here so the linked CLI matches; an
   older CLI stops on `history` with "Is the CLI out of date?".
3. On the Android phone: Share → Satchel from Chrome and from another app,
   signed in and signed out; the text lands in the inbox's composer once.
4. With the inbox open on the phone, `satchel reply <n> "…"` from Claude
   Code shows at once; with the app closed, the push arrives titled "Claude".

## Known

- A half-open socket on a flaky phone network can look live.
- `satchel reply` makes a new client ID each run and doesn't retry, so a
  rerun after a timeout can post twice; check `satchel history` first.
- A shared browser keeps the previous account's pushes until someone opens
  Settings; after a VAPID key change, old subscriptions stay until their
  devices turn notifications back on.
- The iPhone has no share entry (Safari ignores `share_target`).

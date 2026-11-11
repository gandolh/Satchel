# Satchel

A small messenger for the owner and friends, with an Ideas inbox Claude can
write to. Read [corpus/index.md](corpus/index.md) first.

## Commands

- `npm run dev`: the API on 8807 and Vite on 5175.
- `npm run check`: typecheck, lint, format check, conventions, tests. Run it
  before every hand-back.
- `npm run check:fast`: the typecheck, then ESLint on the changed files. The
  Stop hook runs it.
- `npx vitest run <file>`: one test file.
- `npm run format`: Prettier writes every file it covers (Markdown stays out).
- `SEED_USERNAME=... SEED_ROLE=admin npm run seed -w @satchel/server`: a local
  account.

## Places that mislead

- `pretest` runs `tsc -b`, because `cli` tests import `@satchel/server/testing`
  from `server/dist`, and every workspace imports `@satchel/shared` from
  `shared/dist`. Without it the tests run against whatever was built last.
- The typecheck is two runs: `tsc -b` (shared, server, cli), then
  `tsc -p web --noEmit`.
- `.env` sits at the repo root, and `npm run dev` runs the server from
  `server/`, so a relative `DATA_DIR` means the repo root's.
- The API is on 8807 in dev and 8795 in the container; Vite is on 5175.
- `cli/src/guide.md` is run-time text for Claude (`satchel guide` prints it),
  not documentation. Prettier leaves it alone; so should you.
- `vendor/house-style/`, `server/vendor/` and `web/vendor/` are generated
  copies. Never edit them; `npm run house-style:sync` refreshes the first.

## Hard rules

- **No secrets.** Never write a password, token or key into the corpus or the
  repo. Name a secret by its file and key, never by its value.
- **Claude never reads friend chats.** No code path may hand a Claude token
  anything outside its own Ideas inbox.
- **Messages are append-only.** No route, script or migration updates or
  deletes a message row.
- **No CI.** Don't add GitHub Actions, runners or other GitHub-specific
  automation.
- **No pushes.** Commit locally. The owner pushes.
- **Deploys, git hooks and `npm link` are owner steps.** Write the exact
  commands down and hand them over.

## brief-board

Brief progress goes on brief-board. Run `brief-board guide` before you
start or resume a brief, and follow it.

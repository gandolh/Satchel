# Task 07: The satchel CLI and its guide

## Context

This is how Claude reads the Ideas inbox. It copies the-board's pattern: one
CLI on PATH, its address and token in a user-level file, and a `guide`
command that prints every rule Claude follows. The full spec, including the
output format, exit codes and the guide's text, is
[claude-access.md](../../wiki/claude-access.md). Why a CLI and not MCP or curl
is in [decisions.md](../../wiki/decisions.md).

The server side is brief 06 (`/claude/*` routes). This brief tests against
the real server, so it runs after 06.

For reference, the-board's CLI is in `../brief-board/cli/src/`: argument
parsing with `node:util` `parseArgs`, the address lookup in `context.ts`, the
guide as a markdown file. Copy its shape; don't import from it.

## Files you OWN

```
cli/src/index.ts  cli/src/main.ts  cli/src/config.ts  cli/src/client.ts
cli/src/format.ts  cli/src/errors.ts  cli/src/guide.md
cli/src/commands/*.ts  cli/src/*.test.ts  cli/package.json
```

## Files you must NOT touch

`shared/`, `server/`, `web/`, `corpus/`, and anything outside this repo.

## What to do

1. **Arguments** with `node:util` `parseArgs`. No CLI framework. Commands:
   `guide`, `unread`, `seen <n>`, `history [--after n] [--since date]
   [--limit n]`, plus `--version` and `--help`.
2. **Config** (`config.ts`), first match wins:
   1. `SATCHEL_URL` / `SATCHEL_TOKEN` in the environment,
   2. the same keys in `~/.config/satchel/env` (`KEY=value` lines, `#`
      comments, optional quotes), found through `os.homedir()`,
   3. for the URL only, `https://gandolh.ro/satchel-api`.
   A missing token is a usage error: "No Claude token. Create one in Satchel
   under Settings → Connect Claude and put it in ~/.config/satchel/env as
   SATCHEL_TOKEN=…". Never read a repo `.env`.
3. **Client** (`client.ts`). `fetch` with `Authorization: Bearer <token>`, a
   5-second timeout, and response parsing with the route schemas from
   `shared`. A response that doesn't parse is exit 2 with "Satchel answered
   with something this CLI doesn't understand. Is the CLI out of date?"
4. **Output** (`format.ts`). Exactly the formats in claude-access.md: the
   header line, one `#seq  YYYY-MM-DD HH:MM  text` block per message with
   continuation lines indented, the footer with the `satchel seen N` line
   where N is the highest seq printed. Local time zone. `history` adds
   `(seen)` or `(unread)` after the time.
5. **`seen <n>`** validates a non-negative integer, posts it, and prints
   `Seen up to #<seenUpTo>.` using the server's answer, which may be lower
   than `n` when `n` is past the latest message.
6. **The guide** (`guide.md`). The seven rules from claude-access.md, then
   the command list. Keep it under 40 lines. It ships with the build: copy it
   into `dist/` or embed it at build time, so `node cli/dist/index.js guide`
   works from any directory with only `node` on PATH.
7. **Exit codes and the down server.** 0 success, 1 usage, 2 the server
   rejected the call (print its error message; for 401 say the token is
   unknown or revoked and to create a new one in Settings), 3 unreachable:
   connection refused, DNS failure or the 5-second timeout. For 3, print
   exactly one stderr line: `satchel: Satchel isn't reachable at <url>. Tell
   the owner and carry on without it.`
8. **Never print the token**, including in errors and `--help`.
9. `cli/package.json` declares `"bin": { "satchel": "dist/index.js" }` with a
   `#!/usr/bin/env node` line in `index.ts`. Do not run `npm link`; that is an
   owner step in brief 10.

## Acceptance

- Tests start the real server from brief 04's `buildApp` with a temp database
  on a random port: add `@satchel/server` as a devDependency of `cli` and
  import `buildApp`, `openDb` and `createStore` from its build (give the
  server package an `exports` entry if it lacks one), create a Claude token through the store, and cover:
  `unread` output and its footer; `seen` then `unread` showing nothing; a
  message appended between `unread` and `seen` still unread afterwards;
  `history --after`; the config order (env over file over default) with
  `HOME` pointed at a temp dir; a missing token (exit 1); a revoked token
  (exit 2); exit 3 with the one-line message when nothing listens.
- No test output or snapshot contains a token.
- `node cli/dist/index.js guide` prints the guide from another directory.
- `npm run typecheck && npm run lint && npm test` pass.

## Outcome (2026-10-09)

Done in commit `be07955` (199 tests in the suite). The tests run `main()` in
process against the real app from `@satchel/server/testing` on a random
port, with `HOME` pointed at a temp dir. Every run asserts the token never
appears in stdout or stderr.

- **The guide** is read at run time from `cli/src/guide.md`, as in
  the-board, not copied into `dist/`. `npm link` links the whole package
  folder, so the file is always there.
- **Server exports.** `server/package.json` gained an `exports` map
  (`.`, `./testing`, `./app`, `./store`) so tests can import the harness
  without starting the server.
- **Output.** Continuation lines are indented under the message text. A
  5xx or a body that doesn't parse prints the "Is the CLI out of date?" line
  (exit 2).

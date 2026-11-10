# Task 01: The house style and the quality harness

**Depends on:**

- In Satchel: nothing. This brief runs first.
- In the owner's skills library:
  - brief 27, *A house style, and a quality harness that enforces it*: the vendored `house-style` copy at `v1.0.0`, the `house-style` skill, and the plugin's `Stop` and `PostToolUse` hooks;
  - brief 15, *Enforce the base-ui and code-structure skills in every repo*: how the convention checkers are wired and when they run `--warn-only`.
- The owner's grilling of 2026-11-10, questions Q1, Q5-Q14 and Q45-Q51 of the skills library's open questions.

**Runs before:** 02, 03 and 04. The reformat touches 49 of 113 source files, and those three briefs rewrite or move most of them. Formatting first gives one clean reformat commit, and the formatter hook keeps every later diff formatted.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)). If the board is down, say so in the outcome note and carry on.

## Context

On 2026-11-09 the owner made three calls for every web app they own: Base UI 1.9.0 everywhere, the whole app on Tailwind v4, and the researched conventions enforced in each repo. The skills library's brief 27 measured the house style, the one the owner and their agents already write. It found the style consistent but unenforced: nothing formats it and the linter is thin. Its answer is a two-layer harness:

- **The repo's gate:** `npm run check` and its fast subset `npm run check:fast`. They hold for a human, any agent and the deploy.
- **The Claude Code layer:**
  - the plugin's `Stop` hook runs `check:fast`, and exits 2 on a failure;
  - its `PostToolUse` hook formats each saved file;
  - `.claude/rules/web.md` and `.claude/rules/server.md` are scoped by `paths:`;
  - a short `CLAUDE.md` holds the commands.

This brief adopts both layers in Satchel. Briefs 02-04 then turn on their own checks inside it.

### What Satchel has today (read 2026-11-10)

- **`tsconfig.base.json`** has `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `isolatedModules`, and `module` and `moduleResolution` set to `NodeNext`. `web/tsconfig.json` overrides them to `ESNext`/`bundler`, adds `DOM`, `jsx` and `types: ["vite/client"]`, and sets `noEmit`. It has no `incremental`.
- **`eslint.config.js`** (21 lines): `@eslint/js` recommended, `typescript-eslint` recommended untyped (8.69.0), `eslint-plugin-react-hooks` 7.1.1 recommended on `web/src/**/*.{ts,tsx}`, and `_`-prefixed unused names. Vendored code is ignored.
- **No formatter.** No Prettier config, no `format` script.
- **Scripts** (root `package.json`):
  - `typecheck` is `tsc -b && tsc -p web --noEmit`, two runs, and the web one isn't incremental;
  - `lint` is `eslint .`;
  - `test` is `vitest run`, with **no `pretest`**;
  - there is no `check`.
- **No root `CLAUDE.md` and no `.claude/`.** The only `CLAUDE.md` is [corpus/CLAUDE.md](../../CLAUDE.md), which Claude Code loads only once an agent reads a file under `corpus/`. So an agent that never opens the corpus sees no commands and none of the hard rules (no secrets, Claude never reads friend chats, messages are append-only, no CI, no pushes, deploys are owner steps).
- **`.npmrc`** has `save-exact=true`. `engines.node` is `>=24`.
- **The Docker image** (`infrastructure/Dockerfile`) runs `npm ci` twice, in `deps` (line 42) and in `proddeps` (line 66, `--omit=dev`), on `node:24-alpine` with only `python3 make g++` added. There is no `git`.

### A test gate that can pass without testing the current code (found 2026-11-10)

`npm test` has no `pretest`, and three workspaces reach their siblings through built output:

- `server/src/**`, `web/src/**` and `cli/src/**` import `@satchel/shared`, which resolves to `shared/dist` (`shared/package.json` `main`).
- `cli/src/cli.test.ts:8` imports `@satchel/server/testing`, which `server/package.json` (`exports["./testing"]`) points at `server/dist/testing/testApp.js`.

Measured on the scratch copy: with `server/dist` removed, `npx vitest run cli/src/cli.test.ts` fails at the import with no tests run. With `server/dist` present from an older build, the same test would run against that old server. Only `npm run typecheck` (`tsc -b`) rebuilds `dist`, so a run of `npm test` alone, after a change to `shared/` or `server/`, tests whatever was last built. Step 2 closes this.

### Measured on 2026-11-10

Taken on a scratch copy of the tracked files (`git ls-files`), after `npm ci --ignore-scripts` and `npm rebuild better-sqlite3`, with Prettier 3.8.1 and the repo's own TypeScript 6.0.3 and typescript-eslint 8.69.0. The machine has Node 22.23.4 against `engines` `>=24`; npm warned and nothing failed.

**Baseline of the repo as it is:** `npm run typecheck` 5-6 s cold and 3.1 s warm, `npm run lint` 7.9 s, and `npx vitest run` 29 files and 577 tests, all passing (23 s the first time, 14 s on the next run).

**Prettier churn.** `trailingComma: "all"`, defaults otherwise (double quotes, semicolons), on the 113 TypeScript, TSX, JS and MJS files outside `vendor/` (15,893 lines). "Lines changed" is the old lines Prettier touches, the metric the skills library's brief 27 uses:

| `printWidth` | Lines changed | Added + removed | Files changed |
|---|---|---|---|
| 100 | 591 (3.7%) | 2,944 | 79 |
| 110 | 353 (2.2%) | 1,638 | 65 |
| 115 | 280 (1.8%) | 1,131 | 57 |
| **120** | **231 (1.5%)** | 711 | 49 |
| 125 | 244 (1.5%) | **537** | **40** |
| 130 | 315 (2.0%) | 542 | 40 |
| 135 | 376 (2.4%) | 595 | 46 |
| 140 | 457 (2.9%) | 676 | 53 |

For Satchel, 120 touches the fewest old lines and 125 the fewest files and new lines. The two are 13 lines apart. The owner's estate width is 120 (Q8, Q51), so the 120 row is the one-off cost: 231 lines in 49 files, under 1.5% of the code. 127 lines are longer than 120 characters and 43 longer than 130. The longest is 264.

The other file types:

- **CSS:** 3 files, 9 lines added and 4 removed (`web/src/push/notifications.css:36`, `web/src/styles/layout.css:130`, `web/src/styles/tokens.css`): multi-value `transition` and `padding` lines wrapped. Brief 03 deletes all ten stylesheets, so these are throwaway.
- **JSON and `web/index.html`:** no change.
- **Markdown:** 13 files, 117 lines added and 107 removed, among them `README.md`, `corpus/routing.md` (31), four wiki pages and **`cli/src/guide.md`**. That last file is not documentation: the `satchel guide` command prints it to Claude, so a formatter rewriting it changes what Claude is told.

**TypeScript flags.** Added `verbatimModuleSyntax` and `erasableSyntaxOnly` one at a time to `tsconfig.base.json`, then ran `tsc -b` and `tsc -p web --noEmit`:

- **`verbatimModuleSyntax`: 0 errors.** The imports are already `import { type X }`.
- **`erasableSyntaxOnly`: 10 errors**, all constructor parameter properties, in 8 constructors:
  - `server/src/errors.ts:15` (`ApiError`'s `readonly code`);
  - `server/src/store.ts:21` (`ClientIdConflict`), `:30-31` (`NotAMember`, two), `:40` (`UnknownAccount`), `:51` (`InactiveAccount`);
  - `cli/src/client.ts:23-24` (two, one `private readonly`) and `cli/src/errors.ts:12`;
  - `web/src/live.test.ts:37` (a test double).

  The skills library's brief 27 assumes the house has no parameter properties. Satchel has ten.

**The house shapes**, counted with the TypeScript parser over the 113 files (`server/src`, `shared/src`, `web/src`, `cli/src`, the three configs and `docs/images/demo-seed.mjs`):

| Shape | Count | Where |
|---|---|---|
| `enum` | 0 | |
| `any` (the keyword) | 0 | |
| non-null `!` | **13** | `cli/src/config.ts:24, 26` (two on 26), `cli/src/main.ts:71`; tests: `server/src/auth/guard.test.ts:63, 352, 363`, `server/src/live/hub.test.ts:305`, `server/src/live/live.test.ts:167, 197, 198, 199, 210` |
| `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` | 0 / 0 / 0 | |
| `TODO` / `FIXME` / `XXX` / `HACK` | 0 | |
| `console` | 10 | CLIs and the entry before its logger exists: `cli/src/index.ts:19, 20`, `docs/images/demo-seed.mjs:96`, `server/src/index.ts:31, 47, 50, 59`, `server/src/seed.ts:67, 78`. **One is browser code:** `web/src/live.ts:169` |
| default exports | 3 | `eslint.config.js:5`, `vitest.config.ts:5`, `web/vite.config.ts:32`: all configs |
| `declare module "fastify"` | 2 | `server/src/auth/guard.ts:51` (`request.account`), `server/src/routes/claude.ts:30` (`request.claudeToken`): both request-scoped |
| parameter properties | 10 | above |
| classes | 16, of which 13 extend `Error` | the other three: `cli/src/client.ts:21`, and two test doubles |
| `void` on a discarded promise | 44 | already how the code marks them |

**The six typed rules, with `projectService`** (a temporary config on the scratch copy, the rules as errors over all four workspaces):

| Rule | Findings | Where |
|---|---|---|
| `no-floating-promises` | 2 | `server/src/app.ts:148` (the default JSON parser's call: Fastify types it as a callback or a promise, and this uses the callback), `server/src/live/socket.ts:84` (`.finally()` ends the chain with no `.catch`) |
| `no-misused-promises` | 0 | |
| `await-thenable` | 0 | |
| `switch-exhaustiveness-check` | 4 | `web/src/auth/messages.ts:11, 29, 47, 61`: switches on the library's `AuthError.code`, with a `default` |
| `no-unnecessary-type-assertion` | 9 | tests: `server/src/routes/claude.test.ts:246, 342, 392, 444, 466`, `server/src/routes/conversations.test.ts:27`, `server/src/routes/push.test.ts:45`, `server/src/routes/tokens.test.ts:67`, `web/src/push/account.test.ts:23` |
| `consistent-type-imports` | 0 | agrees with `verbatimModuleSyntax` |

**Lint time:** `eslint .` with the typed rules, the Vitest plugin and `eslint-plugin-n` took 15.9 s with `projectService` and 15.0 s with `project`, against 7.9 s untyped. The 6% gap is noise. A single typed file (`server/src/app.ts`) took 3.1 s, Prettier on it 0.5 s, and `tsc -p web --noEmit` 4.7 s, or 3.0 s warm with `--incremental`.

**Other plugins, same temporary config:**

- **`@vitest/eslint-plugin` 1.6.28 recommended:** with `assertFunctionNames: ["expect", "expectError", "expectUnauthorized"]` (the two helper names five test files define) 12 findings: `valid-expect` 4 (`cli/src/cli.test.ts:177`, `web/src/router.test.ts:38`, `web/src/share/share.test.ts:169, 170`), `no-conditional-expect` 5 (`server/src/app.test.ts:180, 181, 187, 189`, `shared/src/api.test.ts:191`), `no-standalone-expect` 2 (`server/src/routes/conversations.test.ts:168`, `server/src/routes/push.test.ts:86`) and `expect-expect` 1 (`shared/src/api.test.ts:412`). Without the helper names it was 18 `expect-expect` findings more.
- **`eslint-plugin-n` 18.5.0 `no-process-env`** on `server/src` outside `config.ts` and tests: 6 findings, `server/src/app.ts:91`, `server/src/index.ts:28`, `server/src/seed.ts:52, 53, 54, 61`. All are brief 04's work.
- **knip 6.44.2, default config:**
  - unused dependencies: **`jose` and `ws`** in `server/package.json` (lines 19 and 21). Nothing under `server/src` or the vendored bundle imports either (`grep` over both). `@fastify/websocket` brings its own `ws`;
  - 23 unused exports and 4 unused types outside `vendor/`, in 19 files (warnings, not errors);
  - `docs/images/demo-seed.mjs` as an unused file, which needs an `entry` in `knip.json`.

**Not measured here:** lint time on Node 24, and the `better-tailwindcss` rules (brief 03's).

## Owner decisions

1. **Vendored `house-style`** (Q6, decided 2026-11-10, technical call). Satchel holds a copy with a version header, refreshed by a `house-style:sync` script that finds the checkout by name, the way Ward's library is shared today. No git, `github:` or tarball dependency, so the image's two `npm ci` stages need no `git` and the Dockerfile stays untouched. Steps 4-6 extend the vendored configs.
2. **Prettier at width 120** (Q8 and Q51, decided 2026-11-10, technical call). Double quotes, semicolons, `trailingComma: "all"` (Q9). 120 is also Satchel's least by lines touched: 231 lines in 49 files, the one-off cost, in one reformat commit.
3. **Markdown stays out of Prettier** (Q45, decided 2026-11-10, technical call). `.prettierignore` lists `*.md`. The corpus is prose that `corpus/lint.sh` governs, and `cli/src/guide.md` is text Claude reads at run time.
4. **tsconfig** (Q11, decided 2026-11-10, technical call). Add `verbatimModuleSyntax` and `erasableSyntaxOnly` now. The ten parameter properties (eight constructors) become declared fields assigned in the constructor, not exceptions. `exactOptionalPropertyTypes` waits for a later brief, after a count. `noUncheckedIndexedAccess` is already on (Q50). TypeScript is 6.0.3, past 5.8.
5. **Typed lint** (Q12 and Q48, decided 2026-11-10, technical calls). The six rules through `projectService`; `project` was not faster. `no-floating-promises` names `describe`, `it` and `test` in `allowForKnownSafeCalls`. `switch-exhaustiveness-check` sets `considerDefaultExhaustiveForUnions: true`, so the four switches in `web/src/auth/messages.ts`, which have a `default`, are expected to stop being findings; step 1 confirms.
6. **The house shapes** (Q13, Q47, technical calls). `!` is an error in source and a warning in tests: the 3 in `cli/src` are errors, the 10 in tests are warnings. Fix all 13 anyway, since each is a one-line change. `console` is allowed in the CLIs and the entry. `web/src/live.ts:169`'s `console.error` is the one browser call: keep it with a single `eslint-disable-next-line no-console` and a reason (a listener that throws must not stop the others, and the browser console is the only place to say so); settle it when step 5 reaches it. A default export is allowed in config files. `no-process-env` (from `eslint-plugin-n`) starts as a **warning**, because its six findings are brief 04's work, and brief 04 turns it into an error.
7. **`check:fast`** (Q10, decided 2026-11-10, technical call). A typecheck plus ESLint on the changed files, built incrementally (`tsc -b`). Target 15 s; the parts measure about 7 s (3.1 s typecheck, 3.1 s one typed file, 0.5 s Prettier).
8. **The Claude Code layer** (Q7, decided 2026-11-10, technical call). It lives in the plugin: `Stop` runs `check:fast`, `PostToolUse` formats the saved file. Nothing is committed to `.claude/settings.json`.
9. **A root `CLAUDE.md`** (Q46, decided 2026-11-10, technical call). A short root `CLAUDE.md` with the commands. The repo-wide **Hard rules** and **brief-board** sections move out of [corpus/CLAUDE.md](../../CLAUDE.md) into it, because they apply outside the corpus.
10. **`pretest`.** `"pretest": "tsc -b"`, so `shared/dist`, `server/dist` and `cli/dist` are current before the tests run. No question: it is the gate failing to reach what it names.
11. **`jose` and `ws`.** Default: remove both if the build, the tests and a container start still pass without them. Otherwise keep them under `ignoreDependencies` in `knip.json`, with the reason.
12. **Deploy** (Q1, fact). The deploy runs `npm ci` and `tsc -b`, no tests or lint, and stays as it is. `npm run check` and the `Stop` hook are the gate.

## Files you OWN

- `tsconfig.base.json`, and `web/tsconfig.json` (only to add `incremental` with a `tsBuildInfoFile`).
- `eslint.config.js`.
- New: the Prettier config, `.prettierignore` and `.git-blame-ignore-revs`, the vendored `house-style` copy (with its version header) and the `house-style:sync` script.
- The root `package.json` (scripts, devDependencies) and `package-lock.json`.
- The reformat itself: whitespace-only changes to every file Prettier covers.
- The fixes the new rules ask for:
  - the eight constructors in `server/src/errors.ts`, `server/src/store.ts`, `cli/src/client.ts`, `cli/src/errors.ts` and `web/src/live.test.ts`;
  - `cli/src/config.ts`, `cli/src/main.ts` and the five test files with the 13 `!`;
  - the two floating promises, the nine test assertions, the twelve Vitest findings, and any switch finding left under Q48;
  - anything else a typed rule finds, fixed or listed in step 5.
- `server/package.json`, only to drop `jose` and `ws` under decision 11.
- New: `.claude/rules/web.md`, `.claude/rules/server.md`, `CLAUDE.md`, `knip.json`.
- [corpus/CLAUDE.md](../../CLAUDE.md): its Hard rules and brief-board sections move out.
- `scripts/conventions.json` (new, brief 15's exceptions file), if an exception is needed.
- Corpus:
  - a new `corpus/wiki/decisions-tooling.md` for this brief's decision, because [wiki/decisions.md](../../wiki/decisions.md) is at 183 of its 200 body lines and the three briefs add about 25;
  - [wiki/status.md](../../wiki/status.md);
  - [log.md](../../log.md);
  - [.planned-roots](../../.planned-roots): drop `.claude` and `scripts` once they exist.

## Files you must NOT touch

- Behaviour. Apart from the fixes listed above, every change is formatting or configuration.
- `server/vendor/` and `web/vendor/`. They are generated copies of the Ward library, and both are ignored by ESLint and Prettier.
- `cli/src/guide.md`: it is run-time text, and Markdown stays out of Prettier.
- `infrastructure/Dockerfile`: vendoring needs no `git` in the image.
- The layout of `server/src` and the CSS, which are briefs 04 and 03.
- The skills library and the `house-style` repo. A rule that seems wrong for Satchel is reported back, not patched locally.

## What to do

One commit per step, each with `npm run typecheck`, `npm test`, `npm run lint` and `npm run build` green.

1. **Vendor `house-style`, then measure**, in the repo's own `node_modules` this time. Copy `house-style` with its version header and add the `house-style:sync` script, which finds the checkout by name; commit that alone. Record these in the `log.md` entry, and compare them with the numbers above:
   - the six typed rules' counts, `projectService` against `project`;
   - `npx knip` from the vendored `house-style` preset;
   - the `tsc` counts with the two new flags;
   - `@vitest/eslint-plugin` recommended's count, with `assertFunctionNames: ["expect", "expectError", "expectUnauthorized"]`.

   Any rule that finds more than about 20 real problems, or mostly false ones, goes back to the owner before it is turned on (brief 27's rule: bring it, don't loosen it). None of today's counts is over 20 except `expect-expect` (18 without the helper names), so expect no stop.
2. **`pretest`.** Add `"pretest": "tsc -b"` to the root `package.json`. Check it by deleting `shared/dist`, `server/dist` and `cli/dist` and running `npm test`: it must build and pass, 29 files and 577 tests.
3. **Prettier, and the reformat.**
   1. Add `prettier` (pinned) and the config: `printWidth: 120`, `trailingComma: "all"`, and the rest default.
   2. Add `.prettierignore`:
      - `*.md`;
      - `server/vendor/` and `web/vendor/`;
      - `package-lock.json`;
      - `dist/`, `dev-dist/`, `data/`, `coverage/`;
      - `web/public/`, `docs/images/`.
   3. Add `"format": "prettier --write ."` and `"format:check": "prettier --check ."`, and commit this alone.
   4. Run `npm run format` and commit only that, as `style: format with Prettier`. Run it when no other brief has uncommitted work.
   5. Add that commit's full hash to `.git-blame-ignore-revs`, in its own commit.
   6. Hand the owner the one-time `git config blame.ignoreRevsFile .git-blame-ignore-revs`.
4. **tsconfig.** Add `verbatimModuleSyntax` and `erasableSyntaxOnly` to `tsconfig.base.json`.
   - Fix the eight constructors with a declared field assigned in the constructor. Each class's behaviour, `readonly` and `private` stay. `web/src/live.test.ts:37` is a test double: same fix.
   - Expect zero from `verbatimModuleSyntax`; if tsc reports any, use inline `type` imports, the house's `import { type X }`.
   - Add `"incremental": true` and a `tsBuildInfoFile` under `node_modules/.tmp/` to `web/tsconfig.json`, so the web typecheck is fast on a second run.
   - The Dockerfile's `npx tsc -b server` must still build.
5. **ESLint.** Extend the vendored house config (decision 1), passing Satchel's roots:
   - web is `web/src`;
   - server is `server/src`;
   - the CLIs are `cli/src/index.ts`, `server/src/seed.ts`, `server/src/index.ts` (later `server.ts`) and `docs/images/*.mjs`.

   The diff in effect, against today's config:

   | Rule | Today | After | Findings today |
   |---|---|---|---|
   | the six typed rules above (`considerDefaultExhaustiveForUnions: true` on the switch rule) | off | error, through `projectService` | 11 expected (2 + 0 + 0 + 0 + 9 + 0): the 4 switch findings have a `default`, which Q48 counts as exhaustive; step 1 confirms |
   | `@typescript-eslint/no-non-null-assertion` | off | error in source, warn in tests (Q47) | 13: 3 in source, 10 in tests (fix them all) |
   | `no-restricted-syntax` on `TSEnumDeclaration` | off | error | 0 |
   | `no-warning-comments` (`todo`, `fixme`), pointing at `corpus/todos/` | off | error | 0 |
   | `no-console` outside the CLIs | off | error | 1 (`web/src/live.ts:169`, decision 6) |
   | `no-default-export` (from `eslint-plugin-import-x`) outside `*.config.*` | off | error | 0 (all 3 are configs) |
   | `no-process-env` (from `eslint-plugin-n`) on `server/src` outside `config.ts` and tests | off | **warn**; brief 04 makes it an error | 6: `app.ts:91`, `index.ts:28`, `seed.ts:52, 53, 54, 61` |
   | `@vitest/eslint-plugin` recommended on `*.test.{ts,tsx}` | off | error | 12 |
   | `no-explicit-any`, `ban-ts-comment` (only `@ts-expect-error` with a description) | error (recommended) | unchanged | 0 |
   | `react-hooks` recommended on `web/src` (7.1.1, with the compiler rules) | on | unchanged | 0 |
   | `better-tailwindcss` | absent | brief 03 adds it | |

   Typed linting needs `allowDefaultProject` for the files no tsconfig includes: `vitest.config.ts`, `eslint.config.js` and `docs/images/*.mjs`. The root `tsconfig.json` has `files: []`, and `web/tsconfig.json` covers `web/src` and `web/vite.config.ts`, so those two are typed already. `docs/images/*.mjs` takes `disableTypeChecked`. Fix what the typed rules find, or list each finding left, with its reason, in the outcome note. For the two floating promises, the default is `void` with a one-line comment saying why the call reports through its callback or its `.finally`.
6. **The gate.** In the root `package.json`:
   - `check` runs:
     - `typecheck`;
     - `lint`;
     - `format:check`;
     - `check:conventions`;
     - `test`.

     `check:conventions` is knip, plus the two convention checkers from the vendored `house-style` copy. `check-base-ui` runs `--warn-only` until brief 03 is done, and `check-structure` `--warn-only` until brief 04 is done. dependency-cruiser joins in brief 04, where the layout it checks appears.
   - `check:fast` runs `typecheck`, then ESLint on the files changed against `HEAD` plus untracked ones (`*.ts`, `*.tsx`, `*.js`, `*.mjs` that exist). Use the vendored copy's script for the changed-file list if it ships one, or a small Node script in `scripts/`. No shell-only syntax: the owner works on Windows under WSL.
   - `lint` stays `eslint .`, the fast subset.
   - Add `knip.json` with the four workspaces and the `entry` for `docs/images/demo-seed.mjs`, and settle `jose` and `ws` (decision 11).

   Time `check:fast` warm with one changed file, and `check` in full. Record both.
7. **`.claude/rules/`.** Keep each file under about 40 lines. Each carries the rules an agent must hold while editing there, and points at the skill for the rest.
   - **`web.md`** (`paths: ["web/src/**"]`):
     - read the `base-ui` skill, and for UI work [wiki/design.md](../../wiki/design.md);
     - Base UI only through `web/src/components/ui/` wrappers, from subpaths (brief 02);
     - tokens only, no raw colours in components (the first lines of `web/src/styles/tokens.css` say it today);
     - Light / Dark / System, light on a first visit (brief 03 builds the switch); colours come from tokens, which switch with the theme;
     - the 900 px breakpoint is `WIDE_QUERY` in `web/src/polling.ts` and the CSS's `wide:` variant, kept in step;
     - self-hosted fonts, never Google at runtime;
     - the service worker (`web/src/sw.ts`) caches the app shell only, never the API;
     - glossary words in UI copy ([wiki/glossary.md](../../wiki/glossary.md));
     - static-markup tests assert roles and text, not class names.

     Brief 03 adds the Tailwind lines.
   - **`server.md`** (`paths: ["server/src/**", "shared/src/**"]`):
     - read the `code-structure` skill, and [wiki/architecture.md](../../wiki/architecture.md) and [wiki/messages-and-seen.md](../../wiki/messages-and-seen.md);
     - `config.ts` is the only reader of the environment;
     - errors are `throw new ApiError(code, message)`, and the body is `{ error: { code, message } }`, which `web/src/api.ts` and the CLI parse;
     - `/api/*` routes take the caller from `signedIn(request)`, and a conversation the caller isn't in is a 404;
     - `/claude/*` routes take the conversation from the token and never name one;
     - messages are append-only: no `UPDATE` or `DELETE` on `messages`;
     - the shared `routes` object in `shared/src/api.ts` is the contract: change a schema there, in the same commit as its route;
     - `server/vendor/` is generated, so never edit it;
     - tests through `startTestApp` in `server/src/testing/testApp.ts`;
     - `shared/dist` and `server/dist` are build output: `npm test` rebuilds them (`pretest`).

     Brief 04 adds the structure lines.
8. **`CLAUDE.md`** at the root, under about 60 lines:
   - one line on what Satchel is;
   - "read [corpus/index.md](../../index.md) first";
   - the commands:
     - `npm run dev`;
     - `npm run check` before every hand-back;
     - `npm run check:fast`;
     - one test with `npx vitest run <file>`;
     - `SEED_USERNAME=… SEED_ROLE=admin npm run seed -w @satchel/server`;
   - the places that mislead:
     - `pretest` builds the workspaces, because `cli` tests import `@satchel/server/testing` from `server/dist`;
     - the typecheck is two runs;
     - `.env` sits at the repo root, and `npm run dev` runs the server from `server/`, so a relative `DATA_DIR` means the repo root's;
     - the API is on 8807 in dev and 8795 in the container, and Vite on 5175;
     - `cli/src/guide.md` is run-time text for Claude, not documentation;
   - the moved Hard rules and brief-board sections.

   [corpus/CLAUDE.md](../../CLAUDE.md) keeps everything else: layout, retrieval budget, frontmatter, briefs, source of truth, decisions and glossary, writing.

   There is no "Conventions" section. Brief 15 first planned one, and brief 27 replaced it with `.claude/rules/`.
9. **Corpus.**
   - Add `corpus/wiki/decisions-tooling.md` with frontmatter, and its entry "The house style, formatted and checked": the width (120), the vendored config source, what was rejected and why. Run `bash corpus/lint.sh --index`.
   - Update [wiki/status.md](../../wiki/status.md) and [log.md](../../log.md).
   - Drop `.claude` and `scripts` from [.planned-roots](../../.planned-roots) once they exist.
   - Run `bash corpus/lint.sh` until it is clean.

## Acceptance

- [ ] `npm run check` passes. Its run time and `check:fast`'s, warm with one changed file, are in the outcome note, and `check:fast` is under about 15 s or the owner has accepted the time.
- [ ] With `shared/dist`, `server/dist` and `cli/dist` deleted, `npm test` builds them and passes. That is the `pretest` check, and it is a command.
- [ ] `npx prettier --check .` passes. The reformat is one commit that changes whitespace only (`git diff -w <hash>^ <hash>` shows nothing outside the reformat), and its hash is in `.git-blame-ignore-revs`. `git diff <hash>^ <hash> --stat -- cli/src/guide.md` prints nothing.
- [ ] `tsconfig.base.json` has `verbatimModuleSyntax` and `erasableSyntaxOnly`. `npm run typecheck` and `docker build -f infrastructure/Dockerfile --target prod .` pass.
- [ ] ESLint reports zero errors with every rule in step 5's table. The counts before and after are in the outcome note, and so is every finding left with its reason.
- [ ] A deliberate `enum`, `!`, `console.log` in `server/src/app.ts`, `// TODO` and `export default` each fail `npm run lint`. Revert them after.
- [ ] `.claude/rules/web.md` and `server.md` exist with `paths:` frontmatter. The root `CLAUDE.md` is under about 60 lines and lists `npm run check`.
- [ ] With the plugin's hooks on, an agent's edit is formatted on save, and a type error stops it at `Stop`.
- [ ] `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 02 adds nothing to the gate. Brief 03 adds `better-tailwindcss` and drops `check-base-ui`'s `--warn-only`. Brief 04 adds dependency-cruiser, drops `check-structure`'s `--warn-only`, and turns `no-process-env` (from `eslint-plugin-n`) into an error.
- The reformat changes three stylesheets by 9 lines. Brief 03 deletes all of them anyway.
- Brief 04 moves `server/src/errors.ts` and `server/src/store.ts`. This brief's constructor fixes go in first, so the moves carry them.

---
summary: Locked calls about Satchel's tooling, each with date, rejected alternatives and reason. The house style, formatted and checked (2026-11-11): Prettier at width 120, a vendored house-style copy, the house flags kept in Satchel's own tsconfig base, and the gate that holds them. The server in the estate's code structure (2026-11-11): by feature, registered by name, zod schemas on every route, the store kept whole, the strict schemas kept strict, and the shutdown.
updated: 2026-11-11
---

# Decisions: tooling

Same tests as [decisions.md](decisions.md): hard to reverse, surprising
without context, a real trade-off. Changing one needs an explicit revisit and a
`log.md` entry.

## The house style, formatted and checked
_2026-11-11_. The code is in the estate's house style, formatted by Prettier at
width 120 (double quotes, semicolons, trailing commas) and checked by one thin
ESLint config, knip, dependency-cruiser and two convention checkers, behind
`npm run check`.

- **The config comes from a vendored copy.** `vendor/house-style/` is a copy
  with a version header (1.0.0), refreshed by `npm run house-style:sync`.
  Rejected: a git, `github:` or tarball dependency, because the image's two
  `npm ci` stages have no `git`, and the Dockerfile stays untouched.
- **The tsconfig flags live in Satchel's own `tsconfig.base.json`.** The
  Dockerfile's `deps` stage copies only that file before `tsc -b server`, so
  extending the vendored base would break the image build. The base holds
  every flag of the copy's, plus its own.
- **Width 120.** It touched the fewest old lines (231 of 15,893) and is the
  estate width. 125 touches fewer files, by 13 lines. Markdown stays out of
  Prettier: the corpus is prose `corpus/lint.sh` governs, and `cli/src/guide.md`
  is text Claude reads at run time.
- **Parameter properties became declared fields** (`erasableSyntaxOnly`), not
  exceptions.
- **`n/no-process-env` and `no-circular` start as warnings,** and the two
  checkers run `--warn-only`; each goes strict with the brief that fixes its
  findings. Since 2026-11-11 all but `check-base-ui` and the CLI's
  `no-process-env` are strict.
- **`pretest` is `tsc -b`.** Tests reach `shared/dist` and `server/dist`, so a
  run could pass against old code.
- **`jose` and `ws` were dropped** from `server/package.json`: nothing imports
  either, and `@fastify/websocket` brings its own `ws`.

## The server in the estate's code structure
_2026-11-11_. The server follows the `code-structure` skill: `server.ts`
listens, `app.ts`'s `buildApp` registers the plugins and then the features,
`config.ts` alone reads the environment, `features/<name>/` is used through
its index, `plugins/` is wrapped in `fastify-plugin`, every route declares its
schemas through `@fastify/type-provider-zod`, and one error handler keeps
`{ error: { code, message } }`.

- **Grouped by feature, not by layer.** Rejected: the `routes/`, `auth/`,
  `live/` and `push/` split Satchel had, where one domain's change touched
  three folders.
- **Registered by name.** Rejected: `@fastify/autoload`. The registration
  order is the guard's order (the `Origin` hook, `wardAuth`, the account
  guard), and a loaded folder hides it.
- **zod through the type provider.** Rejected: TypeBox. The contract was
  already zod in `shared/src/api.ts`, which the web and the CLI parse with.
- **The store stays whole in `server/src/db/store.ts`** (Q54). Rejected: a store per
  feature. `lockOutAccount` is one transaction over three tables and the
  groups share internals, so a split is a brief of its own.
- **Each feature names the part of `RouteDeps` it takes** in its own options
  type. A route file importing `RouteDeps` from `app.ts` closed five cycles.
- **The strict response schemas stay strict.** The token list and the Claude
  replies are `z.strictObject` on purpose, so through the provider a reply
  with an extra field is a 500, not a stripped reply. Rejected: loosening
  them, as the skill's rule 6 asks, because a leaked hash or sender would then
  vanish silently instead of failing.
- **Validation before authorisation** (Q52). A malformed request to an
  owner-only or push-off route is a 400, before the 403 or 404.
- **Shutdown closes the live sockets in `preClose`** with 1001 and cuts a
  client that hasn't answered within a second; the database closes in
  `onClose`, after the pushes. Before, one silent client held SIGTERM for
  30 s, past the container's 10 s stop.

---
summary: Locked calls about Satchel's tooling, each with date, rejected alternatives and reason. The house style, formatted and checked (2026-11-11): Prettier at width 120, a vendored house-style copy, the house flags kept in Satchel's own tsconfig base, and the gate that holds them.
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
  findings.
- **`pretest` is `tsc -b`.** Tests reach `shared/dist` and `server/dist`, so a
  run could pass against old code.
- **`jose` and `ws` were dropped** from `server/package.json`: nothing imports
  either, and `@fastify/websocket` brings its own `ws`.

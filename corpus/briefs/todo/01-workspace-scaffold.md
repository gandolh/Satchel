# Task 01: Workspace scaffold

## Context

Greenfield. The repository is the owner's [gandolh/Satchel](https://github.com/gandolh/Satchel) on GitHub,
already cloned into this directory on `main` (2026-10-09). Its initial commit
holds GitHub's Node `.gitignore`, an MIT `LICENSE` and a one-line
`README.md`; besides those there is only `corpus/`. Everything else waits on
this brief. Keep the LICENSE; extend the existing `.gitignore` and
`README.md` rather than replacing them.

Read [architecture.md](../../wiki/architecture.md) for the four workspaces,
the ports and the local dev wiring, and [decisions.md](../../wiki/decisions.md)
before choosing anything that could go another way. The closest house stack is
the-board (`../brief-board`): copy its tooling shape and its pins.

## Files you OWN

```
package.json  package-lock.json  .npmrc  .gitignore  .env.example  README.md
tsconfig.base.json  tsconfig.json  eslint.config.js  vitest.config.ts
shared/package.json  shared/tsconfig.json  shared/src/index.ts  shared/src/index.test.ts
server/package.json  server/tsconfig.json  server/src/index.ts  server/src/app.ts
web/package.json  web/tsconfig.json  web/vite.config.ts  web/index.html  web/src/main.tsx
cli/package.json  cli/tsconfig.json  cli/src/index.ts
```

## Files you must NOT touch

Anything under `corpus/` except `corpus/.planned-roots` (remove the roots you
create). Don't write the contract, the store, routes, commands or UI. Briefs
02 to 09 own those.

## What to do

1. **Workspaces** `shared`, `server`, `web`, `cli`, named `@satchel/shared`,
   `@satchel/server`, `@satchel/web`, `@satchel/cli`. `save-exact=true` in
   `.npmrc`. `engines.node ">=24"`.
2. **Pins.** Use the-board's exact versions (its root and workspace
   `package.json` files): fastify 5.12.5, better-sqlite3 13.0.3, zod 4.5.4,
   vite 8.2.2, @vitejs/plugin-react 6.1.1, react and react-dom 19.2.8, vitest
   4.1.11, typescript 6.0.3, eslint 10.9.1, typescript-eslint 8.69.0,
   @eslint/js 10.0.1, @types/node 24.19.1, tsx 4.23.13, concurrently with the
   `shell-quote` override the-board carries. Add jose 6.2.10 to `server` (the
   Ward client's pin). Run `npm audit`; if a pin has an advisory, take the
   lowest fixed patch release that is at least two weeks old and say so in
   the outcome note.
3. **TypeScript** as in the-board's `tsconfig.base.json`: ES2023, NodeNext,
   `strict`, `noUncheckedIndexedAccess`, unused locals and parameters,
   `noImplicitOverride`, `isolatedModules`. `shared`, `server` and `cli` are
   composite and build with `tsc -b` into `dist/`. ESLint and Vitest configs
   copied from the-board, including `pool: "forks"` for better-sqlite3.
4. **Placeholders only:**
   - `server/src/app.ts` exports `buildApp()` returning a Fastify instance with
     `GET /api/health` → `{ "ok": true }`. Brief 04 grows its signature.
   - `server/src/index.ts` listens on `HOST` (default `127.0.0.1`) and `PORT`
     (default `8807`) and loads `.env` from the repo root if present
     (`process.loadEnvFile`, ignoring a missing file).
   - `web`: renders "Satchel". `vite.config.ts` sets `base` from
     `SATCHEL_BASE` (default `/satchel/`), the dev server on port 5175 with
     `strictPort`. It proxies `/satchel-api` to `http://127.0.0.1:8807` with
     the prefix stripped, and `^/ward(-api)?(/|$)` to `WARD_PUBLIC_ORIGIN`
     (read from the root `.env`, default `http://localhost:8792`), rewriting
     `Origin` to Ward's origin on requests from the dev server itself. Copy
     that block from `../atrium/apps/web/vite.config.ts`; Ward's `/refresh`
     and `/logout` refuse requests without it.
   - `cli/src/index.ts` prints the package version for `--version`.
   - One smoke test in `shared`, so `npm test` runs something.
5. **Root scripts:** `dev` (build `shared`, then the server in watch mode and
   Vite together), `build`, `start` (the built server), `test`, `typecheck`,
   `lint`.
6. **`.gitignore`:** GitHub's template already covers `node_modules/`,
   `dist`, `.env` and `.env.*`. Add `dev-dist/`, `data/`, `*.local`,
   `infrastructure/.env` and `!.env.example`, so the example file is
   tracked.
7. **`.env.example`**: `HOST`, `PORT`, `DATA_DIR`, and the Ward trio names
   with empty values and a comment that Ward's local `seed.mjs` fills them.
8. **`README.md`**: one paragraph on what Satchel is, a "Run it locally"
   section (`npm install`, `npm run dev`, open
   `http://localhost:5175/satchel/`), and an empty "Owner setup" heading that
   brief 10 fills.

## Acceptance

- From a clean checkout: `npm install && npm run typecheck && npm run lint &&
  npm test && npm run build` all pass, and `npm audit` reports nothing above
  low.
- `npm start`, then `curl http://127.0.0.1:8807/api/health` returns
  `{"ok":true}`.
- `npm run dev` serves the placeholder at `http://localhost:5175/satchel/`,
  and `curl http://localhost:5175/satchel-api/api/health` reaches the server.
- `node cli/dist/index.js --version` prints the version with only `node` on
  PATH.

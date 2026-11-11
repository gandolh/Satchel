---
paths:
  - "server/src/**"
  - "shared/src/**"
---

# The API (`server/src`, `shared/src`)

- Read the `code-structure` skill before you add or move a route, a plugin or
  a module, and [corpus/wiki/architecture.md](../../corpus/wiki/architecture.md)
  and [corpus/wiki/messages-and-seen.md](../../corpus/wiki/messages-and-seen.md).
- `config.ts` is the only reader of the environment. `app.ts`, `index.ts` and
  `seed.ts` still read it themselves (an ESLint warning for now).
- Errors are `throw new ApiError(code, message)`. The body is
  `{ error: { code, message } }`, which `web/src/api.ts` and the CLI parse.
- `/api/*` routes take the caller from `signedIn(request)`. A conversation the
  caller isn't in is a 404.
- `/claude/*` routes take the conversation from the token and never name one.
  Claude never reads anything outside its own Ideas inbox.
- Messages are append-only: no `UPDATE` or `DELETE` on `messages`.
- The shared `routes` object in `shared/src/api.ts` is the contract. Change a
  schema there in the same commit as its route.
- `server/vendor/` is Ward's generated copy. Never edit it.
- Tests go through `startTestApp` in `server/src/testing/testApp.ts`.
- `shared/dist` and `server/dist` are build output: `npm test` rebuilds them
  (`pretest`).
- `npm run check:conventions` runs `check-structure` over these folders,
  `--warn-only` until the server is in the house structure, and
  dependency-cruiser, with `no-circular` a warning for the same reason.

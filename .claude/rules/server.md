---
paths:
  - "server/src/**"
  - "shared/src/**"
---

# The API (`server/src`, `shared/src`)

- Read the `code-structure` skill before you add or move a route, a plugin or
  a module, and [corpus/wiki/architecture.md](../../corpus/wiki/architecture.md)
  and [corpus/wiki/messages-and-seen.md](../../corpus/wiki/messages-and-seen.md).
- `server.ts` is the only file that listens. `app.ts` exports `buildApp` and
  registers, in order: the error plugin, the JSON body plugin, the auth plugin,
  `@fastify/websocket`, then each feature by name.
- `config.ts` is the only reader of the environment (`n/no-process-env` is an
  error). Nothing reads `NODE_ENV`. The seed command reads through
  `loadSeedConfig()`.
- A feature is a folder, `features/<name>/`, used through its `index.ts`. Its
  route plugin names the part of `RouteDeps` it takes in its own options type,
  so no feature imports `app.ts`. `plugins/` holds the cross-cutting plugins
  (errors, the JSON body parser, `auth/`), wrapped in `fastify-plugin`. `lib/`
  never imports Fastify. The store stays whole in `db/store.ts`.
- Every route declares the contract's schemas from `routes` in
  `shared/src/api.ts`, through `@fastify/type-provider-zod`, and is typed
  `FastifyPluginAsyncZod<Options>`: params, querystring and body as it takes
  them, and a response schema for each status the handler sends itself (200
  and 201 where it picks one), never a 401 or another error status. No handler
  parses its input or its reply. `GET /api/live` is the one exception (a
  WebSocket), recorded in `scripts/conventions.json`.
- Errors are `throw new ApiError(code, message)` (`lib/api-error.ts`). The body
  is `{ error: { code, message } }`, which `web/src/api.ts` and the CLI parse.
  A request that fails its schema is a 400 before the handler runs, so a
  malformed request to an owner-only route is a 400, not a 403. A reply that
  fails its schema is a 500 `internal`, logged without values.
- A long-lived response (the live socket) is closed in `preClose`, with 1001;
  the database closes in `onClose`. Check a shutdown on a real socket:
  `inject()` never shows it.
- `/api/*` routes take the caller from `signedIn(request)`. A conversation the
  caller isn't in is a 404.
- `/claude/*` routes take the conversation from the token and never name one.
  Claude never reads anything outside its own Ideas inbox.
- Messages are append-only: no `UPDATE` or `DELETE` on `messages`.
- Change a schema in `shared/src/api.ts` in the same commit as its route.
- `server/vendor/` is Ward's generated copy. Never edit it.
- Tests go through `startTestApp` in `server/src/testing/testApp.ts`; a
  feature's `routes.test.ts` pins its schemas with `routeSchemas`.
- `shared/dist` and `server/dist` are build output: `npm test` rebuilds them
  (`pretest`).
- `npm run check:conventions` runs `check-structure` strict and
  dependency-cruiser over these folders.

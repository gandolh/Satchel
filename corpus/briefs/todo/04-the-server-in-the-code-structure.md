# Task 04: The server in the house code structure

**Depends on:**

- In Satchel: brief 01, for the gate, `eslint-plugin-n`'s `no-process-env` (a warning until this brief), the constructor fixes it makes in `server/src/errors.ts` and `server/src/store.ts`, and `.claude/rules/server.md`.
- In the owner's skills library:
  - brief 03, *A code-structure skill for the Fastify + React apps*: rules 1-11, the `server-skeleton.md` reference, `zod-type-provider.md`, `migrating-a-server.md`, `check-structure.mjs`, and the dependency-cruiser and knip presets;
  - brief 16, *The Fastify servers adopt the code structure*: Satchel's row and the method;
  - brief 15, *Enforce the base-ui and code-structure skills in every repo*: `check-structure` runs `--warn-only` until this brief is done.
- The owner's grilling of 2026-11-10:
  - Q1 (how vps-deploy starts the service);
  - Q23 (`server/src/features/`);
  - Q24 (plugin options, explicit registration);
  - Q25 (response schemas everywhere);
  - Q27 (the test runner);
  - the new questions in decisions 1, 4 and 5.

**Order:** after 01. It touches no file that 02 or 03 touch except `package-lock.json`, so it may run before them, but never at the same time as either.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)); if it is still down (since 2026-10-13), say so in the outcome note.

## Context

The owner asked on 2026-11-09 for one researched code structure, enforced in every repo. Satchel's server is already near it:

- `buildApp(deps)` in `server/src/app.ts` never listens, and `server/src/index.ts` is the entry that does;
- `server/src/config.ts` parses the environment once with zod;
- route plugins get a typed `RouteDeps` (the store, the clock, `live`, `push`) as their options, registered by name, with no autoload;
- errors go through one handler that sends the shared `{ error: { code, message } }`;
- 12 test files drive the app with `inject()` through `startTestApp`;
- **the contract already lives in `shared/src/api.ts`**: a `routes` object holds every route's method, path, auth posture, and its params, query, body and response schemas, and the handlers call `routes.X.body.parse(request.body)` and `routes.X.response.parse(…)` by hand.

What is missing:

- the `server.ts` name;
- six stray reads of the environment;
- feature folders;
- schemas declared on the route, so Fastify validates and serializes;
- `fastify-plugin` on the cross-cutting plugins;
- `close-with-grace`, timeouts and `trustProxy`.

### The versions (verified 2026-11-10)

- **zod 4.5.4** in `shared/package.json`, `server/package.json` and the root `overrides`, with a single copy in `package-lock.json`. `@fastify/type-provider-zod` 1.0.3 needs `>=4.2.0`, so **no zod move**.
- **fastify 5.12.7** (`server/package.json:18`); the latest is 5.12.8, and the provider needs `^5.5.0`.
- **`@fastify/websocket` 11.3.1** and `ws` 8.21.3 (the latter unused by Satchel's own source, brief 01 decision 11).
- **`@fastify/type-provider-zod` 1.0.3** declares `@fastify/swagger >=9.5.1` and `openapi-types ^12.1.3` as peers, not optional, so npm will install them. That is type-only weight, and the lockfile diff shows it. `fastify-plugin` 6.0.1 and `close-with-grace` 2.5.0 are the other new dependencies. Neither the lockfile nor any `package.json` has the two peers today.
- **The image has no `git`** (`infrastructure/Dockerfile`, `node:24-alpine`), so every new dependency must come from the registry, not a `github:` URL.

### The transform trap does not apply here (checked 2026-11-10)

The provider's serializer calls zod's `safeEncode`, and zod throws when encoding through a `.transform()`. A walk over the `_zod` definitions of all 18 entries of `routes` (a script on a scratch build of `shared`) found:

- **no `.transform()`, `.pipe()` or `.default()` in any response schema**;
- one transform, in a **query** schema: `since` in `shared/src/api.ts:26-28` (`z.union([...]).transform((value) => new Date(value).toISOString())`), used by `claudeMessagesQuerySchema` at line 253;
- three `.default()`s, all in query schemas (`after` and `limit` in `listMessages` and `claudeMessages`).

Queries are decoded, and decoding is fine. So the shared schemas can be used as response schemas as they are.

A scratch spike (2026-11-10) also showed that a plugin typed `FastifyPluginAsyncZod<{ n: number }>`, with `schema: { params, body, response: { 200: S, 201: S } }` taken straight from `routes.sendMessage`, and a `wsHandler` route on the same app with `@fastify/websocket` registered, **typechecks under `tsc --strict`** (TypeScript 6.0.3, Fastify 5.12.7, provider 1.0.3, zod 4.5.4). That covers the two shapes Satchel has beyond Almanac's: handlers that choose 200 or 201 at run time, and a WebSocket route.

### The move map: every file under `server/src/` (38: 26 source at 2,930 lines, 12 tests at 4,344)

A bare file name in the table sits at the root of `server/src/`.

| Today | Lines | Target | Note |
|---|---|---|---|
| `index.ts` | 106 | `server.ts` | The entry: `.env` → config → database → accounts → `linkExistingAccounts` → Ward client → `buildApp` → `listen`, `close-with-grace`. Its `.env` read and the data-dir rule move to `config.ts`. |
| `app.ts`, `app.test.ts` | 201, 196 | the same | Keeps `buildApp`, `AppDeps`, `RouteDeps`, `SESSION_COOKIE`, `AUTH_ROUTE_PREFIX`. Its JSON parser (141-149) goes to `server/src/plugins/json-body.ts`, the health route (175) to `server/src/features/health/routes.ts`. `app.test.ts:175-189` walks every entry of `routes` and checks its auth posture: it must keep passing as routes gain schemas. |
| `config.ts`, `config.test.ts` | 169, 140 | the same | Gains `loadEnvFile()`, `resolveDataDir()`, `loadSeedConfig()` and a trusted-proxy list (decision 8). `loadConfig()` keeps its `env = process.env` default. |
| `clock.ts` | 3 | `server/src/lib/clock.ts` | Pure. |
| `errors.ts` | 77 | `server/src/lib/api-error.ts` + `server/src/plugins/errors.ts` | `ApiError` (no Fastify import) to `lib/`; `sendError`, `registerErrorHandling` and the 404 handler to the plugin. The plugin also imports `ClientIdConflict` from the store, as it does today. |
| `server/src/auth/guard.ts`, `.test.ts` | 148, 385 | `server/src/plugins/auth/guard.ts`, `.test.ts` | `signedIn`, `requireOwner`, `registerAccountGuard`, `crossOriginWrite`. Features import `signedIn` from here. |
| `server/src/auth/migrate.ts`, `.test.ts` | 113, 149 | `server/src/plugins/auth/migrate.ts`, `.test.ts` | Called by `server.ts` at boot. |
| `server/src/live/origin.ts` | 45 | `server/src/plugins/auth/origin.ts` | The WebSocket upgrade's `Origin` check is a root hook that must run before the guard. |
| (new) | | `server/src/plugins/auth/index.ts` | `fastify-plugin`: `registerUpgradeChecks`, then `wardAuth`, then `registerAccountGuard`, in today's order (`app.ts:152-173`), so every hook stays a root hook. |
| (new) | | `server/src/plugins/json-body.ts` | `fastify-plugin`: the empty-body JSON parser. |
| `server/src/db/open.ts` | 28 | the same | |
| `server/src/db/migrations.ts` | 107 | the same | |
| `store.ts`, `store.test.ts` | 714, 828 | `server/src/db/store.ts`, `store.test.ts` | **Decision 1.** |
| `server/src/live/hub.ts`, `socket.ts`, `publish.ts` | 110, 102, 85 | `server/src/features/live/` (same names) | |
| `server/src/live/hub.test.ts`, `live.test.ts` | 355, 470 | `server/src/features/live/` (same names) | |
| `server/src/routes/live.ts` | 64 | `server/src/features/live/routes.ts` | The WebSocket route (decision 6). |
| (new) | | `server/src/features/live/index.ts` | What other features may use: `LivePublisher`, `createLivePublisher`, `createHub`. |
| `server/src/push/notifier.ts`, `payload.ts`, `sender.ts` | 115, 29, 39 | `server/src/features/push/` (same names) | |
| `server/src/push/push.test.ts` | 94 | `server/src/features/push/notifier.test.ts` if it tests the notifier; check first | |
| `server/src/routes/push.ts`, `.test.ts` | 42, 476 | `server/src/features/push/routes.ts`, `routes.test.ts` | |
| (new) | | `server/src/features/push/index.ts` | `PushNotifier`, `pushOff`, `createPushNotifier`, `webPushSender`, `SendPush`. |
| `server/src/routes/conversations.ts`, `.test.ts` | 120, 365 | `server/src/features/conversations/routes.ts`, `routes.test.ts` | |
| `server/src/routes/claude.ts`, `.test.ts` | 128, 632 | `server/src/features/claude/routes.ts`, `routes.test.ts` | The bearer routes and their `onRequest` hook. |
| `server/src/routes/tokens.ts`, `.test.ts` | 43, 254 | `server/src/features/tokens/routes.ts`, `routes.test.ts` | The owner's token routes, behind the session. |
| `server/src/routes/me.ts` | 12 | `server/src/features/me/routes.ts` | |
| (new) | | `server/src/features/health/routes.ts` | `GET /api/health`. |
| `seed.ts` | 80 | the same, at the `src/` root | A CLI (`npm run seed`). Its four reads of the environment move to `config.ts`. |
| `server/src/testing/testApp.ts`, `server/src/testing/fakeWard.ts` | 167, 83 | the same | Keep `startTestApp`. `cli/src/cli.test.ts:8` imports `@satchel/server/testing`, so `exports["./testing"]` keeps its target. |

Every file one folder deeper needs its relative imports updated, the vendored Ward library included: seven files import `../vendor/ward/ward-auth.js` or `../../vendor/…` (`app.ts`, `index.ts`, `seed.ts`, `server/src/auth/migrate.ts`, `server/src/auth/guard.test.ts`, `server/src/auth/migrate.test.ts`, `server/src/testing/testApp.ts`). The Dockerfile copies `server/vendor` next to `server/dist` (line 98), so `dist/` mirroring `src/` depth means the image needs no change for it. Crossing imports today: `../store.js` ×8, `../testing/testApp.js` ×7, `../errors.js` ×7, `../app.js` ×7, `../auth/guard.js` ×5, `../db/open.js` ×4.

**Feature boundaries after the move** (rule 5: only through `index.ts`): conversations and claude import `LivePublisher` and `PushNotifier` only as the types in `RouteDeps`, which stays in `app.ts` as `FeatureContext` does in Almanac. Features import `RouteDeps` from `app.ts` as a type; confirm the dependency-cruiser preset treats type-only imports as erased, or move `RouteDeps` to a file under `plugins/` in the same step. `server/src/features/push/` imports `store` types from `db/`, and `server/src/features/live/` imports the conversation lookup through the store it is handed, so no feature imports another.

### Decision on the store (Satchel's one real design call)

`server/src/store.ts` is one 714-line factory, `createStore(db, clock)`, returning 24 methods over six tables (`accounts`, `conversations`, `members`, `messages`, `agent_tokens`, `push_subs`, in `server/src/db/migrations.ts`). Its methods group by feature, but the groups share state:

| Group | Methods |
|---|---|
| accounts and people | `upsertAccount`, `listPeople`, `isAccountActive`, `lockOutAccount` |
| conversations and messages | `ensureInbox`, `createDirect`, `createGroup`, `listConversations`, `getConversation`, `listMessages`, `appendMessage`, `markSeen`, `seenUpTo`, `unreadFor` |
| Claude tokens | `createClaudeToken`, `resolveClaudeToken`, `listClaudeTokens`, `revokeClaudeToken`, `revokeAllClaudeTokens` |
| push subscriptions | `savePushSubscription`, `deletePushSubscription`, `listPushSubscriptions`, `forgetPushEndpoint`, `markPushDelivered` |

Who calls what (measured with `grep` over `server/src`): the guard (`server/src/auth/guard.ts`) uses four groups' methods (`ensureInbox`, `lockOutAccount`, `revokeAllClaudeTokens`, `upsertAccount`); the push notifier uses three (`getConversation`, `isAccountActive`, and the push group); the claude routes use messages and tokens; `lockOutAccountTx` (`store.ts:513-518`) is **one transaction over `accounts`, `agent_tokens` and `push_subs`**, so splitting the factory by feature would put it across three. The internals `requireActiveAccounts`, `insertConversation`, `summaryFor` and `moveMarker` are shared between groups.

Options:

1. **Keep the store whole**, moved to `server/src/db/store.ts` as the data layer. Features keep one `routes.ts`, and `db/` holds all SQL. Rule 11's 400-line warning stays on `store.ts` (as Almanac leaves `scopes.ts` at 567). Nothing about the transaction or the shared internals changes.
2. **Split it into `features/<name>/store.ts`**, as the skill's tree has, with the cross-table `lockOutAccount` moved to a service that composes three stores inside one transaction.

Default: option 1. Satchel's evidence is that the split cannot be settled mechanically: it needs a decision on where `lockOutAccount` and the shared internals live. *New question for the grilling.* If the owner picks 2, it is a separate brief after this one (the move map above stays valid for everything but the store, and `server/src/db/store.ts` is the file it would carve up).

### Every reader of the environment

| Where | What | Afterwards |
|---|---|---|
| `server/src/config.ts:123` | `loadConfig(env = process.env)` | stays, the one reader |
| `server/src/index.ts:28` | `loadConfig(process.env)` | `server.ts` calls `loadConfig()` |
| `server/src/index.ts:21` | `process.loadEnvFile(<repo>/.env)` | `loadEnvFile()` in `config.ts` |
| `server/src/app.ts:91` | `process.env.NODE_ENV !== "test"`: the logger's default | removed: `buildApp`'s default is on, and `startTestApp` already passes `logger` explicitly (`server/src/testing/testApp.ts:113-124`), so the only caller that relied on it is `index.ts` |
| `server/src/seed.ts:52, 53, 54` | `SEED_USERNAME`, `SEED_PASSWORD`, `SEED_ROLE` | `loadSeedConfig()` in `config.ts` |
| `server/src/seed.ts:61` | `DATA_DIR`, with its own `"./data"` default and the same relative-to-repo-root rule as `index.ts:36` | `resolveDataDir()`, one rule shared with the server |
| `server/vendor/ward/ward-auth.js:4045` and `:5159` | `wardClientOptionsFromEnv()` and `AUTH_TRUSTED_PROXIES` | generated code, out of ESLint's reach. `server.ts` passes the values in from `config.ts` where the library takes an option (`trustedProxies`); `wardClientOptionsFromEnv(env)` takes the environment as a parameter, so `config.ts` exports a `loadWardOptions()` that hands it `process.env`. |
| `server/src/config.test.ts`, `seed` tests | set the environment | tests, excepted |
| outside `server/` | `cli/src/index.ts:17`, `web/vite.config.ts:34`, `docs/images/demo-seed.mjs` | out of scope: a CLI, a build config and a doc script |

`NODE_ENV` is also set by the Dockerfile (`ENV NODE_ENV=production`, line 102); only Fastify's dependencies read it.

### Every route: 18 in the contract, plus the live socket

The vendored `wardAuth` plugin's `/auth/*` routes are generated code and out of scope. Every route's schemas already exist in `routes`; the work is declaring them on the route.

| Feature | Method and path | params | querystring | body | response |
|---|---|---|---|---|---|
| health (1) | `GET /api/health` | | | | `200`: `routes.health.response` |
| me (1) | `GET /api/me` | | | | `200` |
| conversations (6) | `GET /api/conversations` | | | | `200` |
| | `POST /api/conversations` | | | `createConversation.body` | `200` and `201` (direct: 201 made, 200 existing; group: 201) |
| | `GET /api/people` | | | | `200` |
| | `GET /api/conversations/:id/messages` | `conversationParamsSchema` | `messagesQuerySchema` | | `200` |
| | `POST /api/conversations/:id/messages` | yes | | `sendMessageRequestSchema` | `200` and `201` (201 stored, 200 repeated client ID) |
| | `POST /api/conversations/:id/seen` | yes | | `seenRequestSchema` | `200` |
| tokens (3) | `GET /api/claude-tokens` | | | | `200` |
| | `POST /api/claude-tokens` | | | | `201`, with `cache-control: no-store` set by the handler |
| | `POST /api/claude-tokens/:id/revoke` | `claudeTokenParamsSchema` | | | `200` |
| push (3) | `GET /api/push/key` | | | | `200` |
| | `POST /api/push/subscriptions` | | | `savePushSubscriptionRequestSchema` | `200` and `201` (201 new endpoint) |
| | `DELETE /api/push/subscriptions` | | | `deletePushSubscriptionRequestSchema` | `200` |
| claude (4) | `GET /claude/unread` | | | | `200` |
| | `POST /claude/seen` | | | `seenRequestSchema` | `200` |
| | `GET /claude/messages` | | `claudeMessagesQuerySchema` | | `200` |
| | `POST /claude/messages` | | | `sendMessageRequestSchema` | `200` and `201` |
| live (1) | `GET /api/live` | | | | none: WebSocket (decision 6) |

**Hand parsing removed:** 13 calls of `.parse()` on request input in 4 files: `routes/conversations.ts:58, 79, 80, 92, 93, 111, 112`; `routes/claude.ts:73, 83, 111`; `routes/push.ts:29, 38`; `routes/tokens.ts:38`. **Hand serialization removed:** 19 calls of `routes.X.response.parse(…)`: `server/src/routes/conversations.ts` 7, `server/src/routes/claude.ts` 4, `server/src/routes/push.ts` 3, `server/src/routes/tokens.ts` 3, `server/src/routes/me.ts` 1, and `app.ts:175`. `live/hub.ts:85` parses a WebSocket event, not an HTTP request or reply, and stays.

**Two behaviour changes the schemas bring, both to test and record:**

1. **Order.** Today a handler checks who may call before it parses: `requireOwner` precedes `routes.revokeClaudeToken.params.parse` (`routes/tokens.ts:36-38`), and `if (push.publicKey === null) throw pushOff()` precedes the body parse (`routes/push.ts:27-29`). With schemas, Fastify validates first, so a malformed request to those routes answers **400** where a friend or a push-off server answered 403 or 404. The session guard is a root hook and still answers 401 first. Decision 5.
2. **A bug is now a 500.** Today a handler whose `response.parse` fails throws a `ZodError`, which `errors.ts:60-62` answers as **400 `invalid_request`**: a server bug dressed as the client's fault. With the provider it is a response serialization error, answered 500 `internal` and logged. No existing test depends on the old answer (check in step 1).

### The error plugin

`server/src/plugins/errors.ts`, wrapped in `fastify-plugin` and registered first. It **keeps Satchel's body, `{ error: { code, message } }`** (the shared `apiError`), because `web/src/api.ts` and `cli/src/client.ts` parse it. The handler, in order:

1. `ApiError` → its code.
2. `hasZodFastifySchemaValidationErrors(error)` → 400 `invalid_request`, the message the first issue's, as today (`errors.ts:61` sends `issues[0]?.message`, with no path prefix).
3. A `z.core.$ZodError` → 400 `invalid_request`, kept for the zod parses that remain (config, hub).
4. `ClientIdConflict` → 409 `client_id_conflict`.
5. `isResponseSerializationError(error)` → 500 `internal`, logged with the method and URL. Never shown to the client.
6. A 4xx Fastify raised (bad JSON, 413, 415) → its status and the matching code, as `codeForClientStatus` does.
7. Anything else, `NotAMember` included → 500 `internal`, logged.

The 404 handler stays. It isn't rate-limited: `@fastify/rate-limit` is not a dependency, and rule 8 asks for it only where it is present. The tests that match messages must pass unchanged.

### The `server.ts` / `app.ts` split

`server.ts` keeps what `index.ts` does, in the same order, and adds:

1. `loadEnvFile()` and `loadConfig()`. A `ConfigError` goes to stderr and the process exits 1, before any logger exists.
2. `buildApp({ …, server: { connectionTimeout, requestTimeout, keepAliveTimeout, trustProxy } })`; `AppDeps` gains `server`, passed to `Fastify()`.
3. `close-with-grace`, in place of the two `process.once` signal handlers (`index.ts:84-99`). It must still `await app.close()` (which drains pushes through the `onClose` hook, `app.ts:189`) and then `db.close()`.
4. `listen({ host, port })`.

`app.ts` registers in a fixed order: errors plugin, JSON body plugin, the provider's compilers, the auth plugin, then `@fastify/websocket`, then the features. Today six of those registrations are `void app.register(…)` (`app.ts:178, 193-198`); make them `await`, which keeps the order and surfaces a failed registration at boot instead of at `ready()`. `@fastify/websocket` stays before the routes it wraps (the comment at `app.ts:177`).

**Renaming the entry moves the built file** from `server/dist/index.js` to `server/dist/server.js`. These name it in this repo:

- `infrastructure/Dockerfile:113`: `CMD ["node", "server/dist/index.js"]`;
- the root `package.json`: `start`;
- `server/package.json`: `main` (line 7), `dev` (`tsx watch src/index.ts`, line 10), `start` (line 11), `exports["."]` (lines 29-33).

`infrastructure/docker-compose.yml` has no `command:`, so the `CMD` is the only in-repo start. No code imports `@satchel/server` by its `exports` except `cli/src/cli.test.ts:8`, which uses `./testing`. `exports["./app"]` and `["./store"]` have no importer; point them at the new paths (the store at `dist/db/store.js`), or drop them if knip (brief 01) calls them unused, and record which.

vps-deploy builds and runs this image (`node cli.ts satchel all`, [docs/owner-setup.md](../../../docs/owner-setup.md)), so the `CMD` is the likely start command, but its Satchel stack may also name the file. That is Q1; vps-deploy wasn't readable here. See decision 3.

### Test impact

- 12 server test files (4,344 lines, 245 `it`s of the repo's 577 tests), on vitest with `pool: "forks"` (`vitest.config.ts`, include `*/src/**/*.test.{ts,tsx}`, which still matches nested folders). 8 of them use `startTestApp`, and `cli/src/cli.test.ts` does too.
- Moved tests need their relative imports updated; none changes an assertion, apart from what decision 5 settles.
- New tests:
  - an extra field on a store row is stripped from a reply (the schema, not a hand parse, now does it);
  - a reply that fails its response schema is a 500 `internal` with no detail (and the old 400 is gone);
  - a malformed id on the token revoke route, as a friend, and a malformed body on push-off, pinning decision 5;
  - the health route's schema;
  - `startTestApp` keeps logging off with `NODE_ENV` unset (the removed default).

## Owner decisions (defaults this brief builds)

1. **The store** (see above). Default: keep it whole in `server/src/db/store.ts`. *New question for the grilling.*
2. **`server/src/features/<name>/`** (Q23), **typed plugin options** (Q24) and **a response schema on every route** (Q25). Default: yes, as in the move map. `RouteDeps` stays the typed options and keeps its name (renaming it `FeatureContext` would touch 8 files for nothing); decorators stay for request-scoped values only, and Satchel already has exactly two, `request.account` and `request.claudeToken` (`declare module "fastify"`, `auth/guard.ts:51`, `routes/claude.ts:30`).
3. **The entry file** (Q1). Default: rename to `server.ts`, and change the Dockerfile, the scripts and `exports` in the same commit. If vps-deploy's Satchel stack names `dist/index.js`, change it there in the same session as an owner step (the exact edit handed over), or keep `index.ts` and record the exception in `scripts/conventions.json`.
4. **The error body.** The code-structure skill's rule 8 names `{ error, message, issues? }`, and Satchel sends `{ error: { code, message } }`, which its web and CLI parse. Default: keep Satchel's shape; the rule's substance (one handler, no 5xx detail, a validation code) holds. *New question for the grilling*, shared with Almanac's: does the skill prescribe a shape or only the handler?
5. **Validation before authorization on three routes.** Default: accept it. A malformed request to the token revoke route, the push routes or `/claude/*` is a 400 before the owner or push-off check, which is the usual REST order and leaks nothing the 401 guard doesn't already gate. The alternative is to keep the old order by moving the owner and push-off checks into a `preValidation` hook on those routes. *New question for the grilling.*
6. **The WebSocket route.** Default: `GET /api/live` declares no response schema (an upgrade has no body), and its plain-GET 400 stays a handler answer. Record it in `scripts/conventions.json` if `check-structure` flags a route without a `schema`. Its `wsHandler` typechecked in the spike.
7. **The test runner and helper** (Q27). Default: vitest stays, and `startTestApp` keeps its name (renaming it to the skill's `buildTestApp` would touch 9 files for nothing). Record it in `conventions.json` if the checker looks for the name.
8. **Timeouts and proxy.** Defaults:
   - `connectionTimeout: 10_000`;
   - `requestTimeout: 30_000`; no route runs long, and a push fan-out starts after the reply;
   - `keepAliveTimeout: 125_000`, above Caddy's default two-minute idle keep-alive to its upstreams. Check the deploy's Caddy snippet for its own `keepalive`;
   - `trustProxy`: the peers in `AUTH_TRUSTED_PROXIES`, parsed once in `config.ts` and also handed to `wardAuth` as `trustedProxies`, so there is one list and one reader. `request.ip` only affects logs; Ward's login lockout reads the socket itself (`server/vendor/ward/ward-auth.js:4884`).
9. **Logging.** Default: JSON as today, with the redaction paths in `app.ts` unchanged, and no `pino-pretty`.
10. **Fastify 5.12.8.** Default: not in this brief. The bump goes with the estate's next one.
11. **Web layout.** `web/src/<feature>/` already groups by feature, but the skill's tree says `web/src/features/<name>/`. Default: not in this brief; `web/` is untouched here. *New question for the grilling:* does the skill's web tree apply to apps whose web is already grouped by feature, under a different parent?

## Files you OWN

- `server/src/**`: the moves, the new plugins, the schemas wired in.
- `server/package.json` (scripts, `main`, `exports`, the new dependencies pinned: `@fastify/type-provider-zod` 1.0.3, `@fastify/swagger`, `openapi-types`, `fastify-plugin` 6.0.1, `close-with-grace` 2.5.0) and `package-lock.json`.
- `shared/src/**`, only if a schema needs an output-safe twin (none is expected) or `healthResponseSchema` needs a test.
- `infrastructure/Dockerfile`: the `CMD` line.
- The root `package.json`: `start`, and `check:conventions` (dependency-cruiser added, `check-structure`'s `--warn-only` dropped).
- `.dependency-cruiser.cjs` (new, from the skill's preset).
- `eslint.config.js`: `eslint-plugin-n`'s `no-process-env`, from warning to error.
- `scripts/conventions.json`, for any exception from decisions 3, 6 or 7.
- `.claude/rules/server.md`: the structure lines.
- Corpus:
  - [wiki/architecture.md](../../wiki/architecture.md): the layout and the request paths that name `routes/`, `auth/`, `live/` and `push/`;
  - [wiki/claude-access.md](../../wiki/claude-access.md) and [wiki/messages-and-seen.md](../../wiki/messages-and-seen.md): any path they name (`grep -n "server/src" corpus/wiki/*.md`);
  - `corpus/wiki/decisions-tooling.md`: a new entry adopting the structure (brief 01 creates the page);
  - [wiki/status.md](../../wiki/status.md);
  - [log.md](../../log.md).
- `docs/architecture.md`, `docs/getting-started.md` and `docs/owner-setup.md`, for any `server/src` or `dist/index.js` path.

## Files you must NOT touch

- `web/` and `cli/`. A response schema that drops a field the web or the CLI reads is a finding: fix the schema, not them.
- `shared/` schemas and their behaviour.
- `server/vendor/`: generated.
- The deploy beyond the `CMD` line. vps-deploy edits are handed to the owner.
- Behaviour: status codes, error codes and messages, and every route's JSON apart from the two changes listed (validation order and a serialization failure's 500) and any field the comparison shows was a leak.
- The hard rules: messages stay append-only (no `UPDATE` or `DELETE` on `messages` appears in any moved or new code), and no `/claude/*` handler gains a way to name a conversation.

## What to do

Follow `migrating-a-server.md`. One commit per step; after each, `npm run check` and `npm run build` pass, and `npm start` serves `GET /api/health`.

1. **Before.**
   - Run `check-structure` strict and record its counts by rule.
   - Seed a scratch `DATA_DIR` (`npm run seed -w @satchel/server`, then `docs/images/demo-seed.mjs`, as [docs/images/shots.md](../../../docs/images/shots.md) does).
   - Save the JSON of every route above, as the owner, as a friend and with a Claude token, with fixed queries: the success bodies, and for each route the error bodies you can reach (400, 401, 403, 404, 409 client-id conflict, 413).
   - `grep -rn "400\|invalid_request" server/src --include=*.test.ts` and read the ones on routes whose handler parses a response, to confirm none depends on the old 400.
2. **`config.ts` and the split.** Add the helpers to `config.ts` (decision 8's proxy list included). `seed.ts` uses them. `index.ts` becomes `server.ts`, with the entry-file changes (decision 3), `close-with-grace`, the timeouts and `trustProxy`. Remove the `NODE_ENV` default from `buildApp`. `no-process-env` now finds nothing outside tests; make it an error.
3. **The error plugin**, `server/src/lib/api-error.ts`, `server/src/lib/clock.ts`, `server/src/plugins/json-body.ts` and `server/src/plugins/auth/`, as in the move map. Every test passes unchanged. `await` the registrations.
4. **Feature folders.** Use `git mv`, file by file per the map, so history follows. Move the store to `server/src/db/` (decision 1). Add the `index.ts` files. Add `.dependency-cruiser.cjs`, and check that a deliberate import of `server/src/features/push/sender.js` from `server/src/features/conversations/` fails it.
5. **The type provider and the schemas, one feature per commit:** health, me, tokens, push, conversations, claude. Live keeps its handler (decision 6). Each commit:
   - declares params, querystring, body and response from `routes.X`, with `{ 200: S, 201: S }` where the handler picks the status;
   - removes that feature's `.parse(request.…)` and `routes.X.response.parse(…)`;
   - types the plugin as `FastifyPluginAsyncZod<RouteDeps>`;
   - adds the new tests that apply.
6. **After.** Save the same JSON again and diff it against step 1's. A field that disappeared is a leak (keep it dropped and list it) or a missing schema field (add it). The two known differences (decision 5's order, and a serialization failure's 500) are expected; anything else is a finding. Put the diff's summary in the `log.md` entry.
7. **Strict.** Drop `check-structure`'s `--warn-only` and make dependency-cruiser part of `check:conventions`.
8. **Corpus.**
   - Add an entry to `corpus/wiki/decisions-tooling.md` adopting the structure, with what was rejected (the layer split Satchel had, autoload, TypeBox) and why.
   - Update the pages listed under Files you OWN, `.claude/rules/server.md`, [wiki/status.md](../../wiki/status.md) and [log.md](../../log.md).
   - Run `bash corpus/lint.sh` until it is clean.

## Acceptance

- [ ] `check-structure` passes **strict**, with any exception in `scripts/conventions.json` and its reason. Its counts before and after are in the outcome note, for the skills library's brief 16 table.
- [ ] `grep -rnE "\.(safeParse|parse)\(request\." server/src` prints nothing, and `grep -rn "response\.parse(" server/src --include=*.ts | grep -v test` prints nothing. Every route in the table but the socket has a `schema` with a `response`.
- [ ] `grep -rn "process\.env" server/src --include=*.ts | grep -v "\.test\.ts"` prints only `config.ts`, and ESLint's `no-process-env` (from `eslint-plugin-n`) is an error. `grep -rn "NODE_ENV" server/src` prints nothing.
- [ ] The stripped-field test, the serialization-500 test, the two ordering tests, the health test and the `startTestApp` logging test pass, along with every existing test unchanged (577 plus the new ones).
- [ ] The before and after JSON comparison is in `log.md`, with every dropped field named and the two known differences recorded.
- [ ] `npm run build` writes `server/dist/server.js`. `docker build -f infrastructure/Dockerfile --target prod .` succeeds, and the container answers its health check. The vps-deploy step, if any, is handed to the owner as exact commands.
- [ ] `npm test` still passes with `shared/dist`, `server/dist` and `cli/dist` deleted first (brief 01's `pretest`), and `cli/src/cli.test.ts` still imports `@satchel/server/testing`.
- [ ] dependency-cruiser fails on a deliberate cross-feature import and passes clean.
- [ ] `npm run check` passes, and `bash corpus/lint.sh` ends clean.

## Interplay

- If brief 01 has dropped `server/package.json`'s `exports` as unused, step 2 has two fewer lines to change.
- If brief 01 removed `jose` and `ws`, the provider's install adds no overlap with them; if it kept them, `knip.json` carries the reason.
- The skills library should hear about the validation-order change (decision 5) and the 400-to-500 change for a failed response parse before the other servers run brief 16: both apply to any server that parses by hand inside its handlers.
- Brief 03 doesn't touch `server/`. If both are open at once, they conflict only in `package-lock.json`, so don't run them at the same time.

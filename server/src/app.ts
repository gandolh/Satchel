import fastifyWebsocket from "@fastify/websocket";
import { routes } from "@satchel/shared";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { wardAuth, type Accounts, type WardClient } from "../vendor/ward/ward-auth.js";
import { registerAccountGuard } from "./auth/guard.js";
import type { Clock } from "./clock.js";
import type { VapidKeys } from "./config.js";
import { registerErrorHandling } from "./errors.js";
import { createHub } from "./live/hub.js";
import { registerUpgradeChecks } from "./live/origin.js";
import { createLivePublisher, type LivePublisher } from "./live/publish.js";
import { LIVE_MAX_PAYLOAD_BYTES } from "./live/socket.js";
import { createPushNotifier, pushOff, type PushNotifier } from "./push/notifier.js";
import { webPushSender, type SendPush } from "./push/sender.js";
import { claudeRoutes } from "./routes/claude.js";
import { conversationRoutes } from "./routes/conversations.js";
import { liveRoutes } from "./routes/live.js";
import { meRoutes } from "./routes/me.js";
import { pushRoutes } from "./routes/push.js";
import { tokenRoutes } from "./routes/tokens.js";
import type { Store } from "./store.js";

/** Where the plugin's routes sit as Fastify sees them. The proxy strips the API prefix, so the browser reaches them at `<apiPrefix>/auth/...`. */
export const AUTH_ROUTE_PREFIX = "/auth";

/** Request bodies above this are refused with 413 `invalid_request`. */
export const BODY_LIMIT_BYTES = 64 * 1024;

/**
 * Never logged. Fastify's request serializer already leaves headers out; these
 * catch a handler that logs a headers object itself, at the top level or one
 * level down (`{ req: { headers } }`, `{ request: { headers } }`).
 */
export const REDACTED_LOG_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
  "*.headers.authorization",
  "*.headers.cookie",
];

/** Where the logger writes. Tests pass a stream to read the lines back. */
export interface LogOptions {
  level?: string;
  stream?: { write(line: string): void };
}

/** Web Push (brief 14). Absent means push is off. */
export interface PushOptions {
  vapid: VapidKeys;
  /** Default: web-push with `vapid`. Tests pass a stub. */
  send?: SendPush;
}

/** The session cookie's name. Unique in the estate: every app shares one origin. */
export const SESSION_COOKIE = "satchel_session";

export interface AppDeps {
  store: Store;
  /** The local accounts, on the same SQLite handle as `store` (`createAccounts({ store: createSqliteStore(db) })`). */
  accounts: Accounts;
  /** "Sign in with Ward". Absent means local accounts only, and the Ward button is hidden. `index.ts` builds it from the environment. */
  ward?: WardClient;
  /** The app's origin as the browser sees it. The guard refuses writes and WebSocket upgrades from any other. */
  publicOrigin: string;
  /** The API prefix as the browser sees it (`/satchel-api`): the session cookie's `Path`. The Ward callback lives under it. */
  apiPrefix: string;
  /** The web app's base path with a trailing slash (`/satchel/`): where Ward sends the browser back to. */
  webBase: string;
  clock: Clock;
  /** Web Push. Default: off (`GET /api/push/key` is a 404 and nothing is sent). `index.ts` passes it when VAPID is configured. */
  push?: PushOptions;
  /** How often an open live socket asks the guard again, in ms. Default `LIVE_RECHECK_MS`. Tests shorten it. */
  liveRecheckMs?: number;
  /** Default: on, except when `NODE_ENV=test`. Redaction applies either way. */
  logger?: boolean | LogOptions;
}

/** What every route plugin is registered with. `/claude/*` gets no Ward client on purpose. */
export interface RouteDeps {
  store: Store;
  clock: Clock;
  /** Sends live events to open sockets after a store call succeeded (`live/publish.ts`). Never throws. */
  live: LivePublisher;
  /** Sends Web Push for a stored message, after the reply (`push/notifier.ts`). Never throws. */
  push: PushNotifier;
}

function loggerOptions(logger: AppDeps["logger"]): FastifyServerOptions["logger"] {
  const setting = logger ?? process.env.NODE_ENV !== "test";
  if (setting === false) return false;
  const options = setting === true ? {} : setting;
  return {
    level: options.level ?? "info",
    redact: { paths: REDACTED_LOG_PATHS, censor: "[redacted]" },
    ...(options.stream ? { stream: options.stream } : {}),
  };
}

/**
 * The Fastify app, not listening. Tests `inject` into it; `index.ts` listens.
 *
 * - The vendored `wardAuth` plugin is the guard: one root `onRequest` hook that
 *   refuses every route without a live session except `GET /api/health` and
 *   `/claude/*`, judged by route pattern, and serves `/auth/*` (local login,
 *   "Sign in with Ward", the 30-second Ward check). `auth/guard.ts` then
 *   turns the session's user into `request.account` on `/api/*`.
 *   `/claude/*` takes a Claude token instead and never has a session.
 * - Route plugins (`routes/*.ts`) take `RouteDeps`, so later briefs fill them
 *   in without editing this file.
 * - Live updates (brief 12): `@fastify/websocket` serves `GET /api/live`
 *   behind the same guard, and re-checks it while open (`live/socket.ts`).
 *   A WebSocket upgrade must carry the app's own
 *   `Origin`; that check is a root hook ahead of the guard
 *   (`live/origin.ts`). The hub knows who has a socket open; route plugins
 *   publish through `RouteDeps.live`.
 * - Web Push (brief 14): `RouteDeps.push` notifies the other members' devices
 *   of a stored message, after the reply; off unless `push` is passed. Closing
 *   the app waits for pushes already started.
 * - Errors leave as the shared `{ error: { code, message } }` (`errors.ts`).
 */
export async function buildApp({
  store,
  accounts,
  ward,
  publicOrigin,
  apiPrefix,
  webBase,
  clock,
  push: pushOptions,
  liveRecheckMs,
  logger,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: loggerOptions(logger), bodyLimit: BODY_LIMIT_BYTES });

  // A POST with `Content-Type: application/json` and no body is a body of
  // `undefined`, not a 400: the token routes take no body and a client may
  // still send the header. Everything else goes to Fastify's own parser, which
  // keeps its prototype-poisoning checks and its 400 for bad JSON.
  const parseJson = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    if (body === "") {
      done(null, undefined);
      return;
    }
    parseJson(request, body as string, done);
  });

  registerErrorHandling(app);
  registerUpgradeChecks(app, publicOrigin);
  // First of the app's own routes and plugins: the guard is a root hook, and
  // Fastify copies hooks into a plugin's context when it is created.
  await app.register(wardAuth, {
    accounts,
    cookieName: SESSION_COOKIE,
    cookiePath: apiPrefix,
    publicOrigin,
    routePrefix: AUTH_ROUTE_PREFIX,
    // `/claude/*` takes a Claude token and has no session. `isPublic` sees the matched route pattern.
    publicRoutes: [`GET ${routes.health.path}`],
    isPublic: (request) => (request.routeOptions.url ?? "").startsWith("/claude/"),
    ...(ward && {
      ward: {
        client: ward,
        loginPath: webBase,
        settingsPath: `${webBase}settings`,
        afterSignInPath: webBase,
      },
    }),
  });
  registerAccountGuard(app, { store, publicOrigin });

  app.get(routes.health.path, () => routes.health.response.parse({ ok: true }));

  // Before the route plugins: it wraps the handlers of routes registered after it.
  void app.register(fastifyWebsocket, { options: { maxPayload: LIVE_MAX_PAYLOAD_BYTES } });

  const hub = createHub(app.log);
  const push = pushOptions
    ? createPushNotifier({
        store,
        publicKey: pushOptions.vapid.publicKey,
        send: pushOptions.send ?? webPushSender(pushOptions.vapid),
        log: app.log,
      })
    : pushOff;
  app.addHook("onClose", async () => {
    await push.whenIdle();
  });
  const deps: RouteDeps = { store, clock, live: createLivePublisher({ hub, store, log: app.log }), push };
  void app.register(meRoutes, deps);
  void app.register(conversationRoutes, deps);
  void app.register(tokenRoutes, deps);
  void app.register(pushRoutes, deps);
  void app.register(claudeRoutes, deps);
  void app.register(liveRoutes, { hub, sessionUrl: `${AUTH_ROUTE_PREFIX}/session`, ...(liveRecheckMs ? { recheckMs: liveRecheckMs } : {}) });

  return app;
}

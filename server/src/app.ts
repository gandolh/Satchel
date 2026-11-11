import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Accounts, WardClient } from "../vendor/ward/ward-auth.js";
import type { VapidKeys } from "./config.js";
import type { Db } from "./db/open.js";
import type { Store } from "./db/store.js";
import { claudeRoutes } from "./features/claude/index.js";
import { conversationRoutes } from "./features/conversations/index.js";
import { healthRoutes } from "./features/health/index.js";
import {
  LIVE_CLOSE_TIMEOUT_MS,
  LIVE_MAX_PAYLOAD_BYTES,
  closeLiveSockets,
  createHub,
  createLivePublisher,
  liveRoutes,
  type LivePublisher,
} from "./features/live/index.js";
import { meRoutes } from "./features/me/index.js";
import {
  createPushNotifier,
  pushOff,
  pushRoutes,
  webPushSender,
  type PushNotifier,
  type SendPush,
} from "./features/push/index.js";
import { tokenRoutes } from "./features/tokens/index.js";
import type { Clock } from "./lib/clock.js";
import { authPlugin } from "./plugins/auth/index.js";
import { errors } from "./plugins/errors.js";
import { jsonBody } from "./plugins/json-body.js";

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

/** Web Push. Absent means push is off. */
export interface PushOptions {
  vapid: VapidKeys;
  /** Default: web-push with `vapid`. Tests pass a stub. */
  send?: SendPush;
}

/** The session cookie's name. Unique in the estate: every app shares one origin. */
export const SESSION_COOKIE = "satchel_session";

/** Fastify's options that belong to the process. `server.ts` sets them; tests leave them out. */
export type ServerOptions = Pick<
  FastifyServerOptions,
  "trustProxy" | "connectionTimeout" | "requestTimeout" | "keepAliveTimeout"
>;

export interface AppDeps {
  store: Store;
  /** The local accounts, on the same SQLite handle as `store` (`createAccounts({ store: createSqliteStore(db) })`). */
  accounts: Accounts;
  /**
   * The database `store` and `accounts` are on. When given, closing the app
   * closes it, once every request and the pushes already started are done.
   * Tests leave it out and close their own.
   */
  db?: Db;
  /** "Sign in with Ward". Absent means local accounts only, and the Ward button is hidden. `server.ts` builds it from the environment. */
  ward?: WardClient;
  /** The app's origin as the browser sees it. The guard refuses writes and WebSocket upgrades from any other. */
  publicOrigin: string;
  /** The API prefix as the browser sees it (`/satchel-api`): the session cookie's `Path`. The Ward callback lives under it. */
  apiPrefix: string;
  /** The web app's base path with a trailing slash (`/satchel/`): where Ward sends the browser back to. */
  webBase: string;
  /** The proxies whose `X-Forwarded-For` the sign-in lockout believes, besides loopback (`AUTH_TRUSTED_PROXIES`). Default: none. */
  trustedProxies?: readonly string[];
  clock: Clock;
  /** Web Push. Default: off (`GET /api/push/key` is a 404 and nothing is sent). `server.ts` passes it when VAPID is configured. */
  push?: PushOptions;
  /** How often an open live socket asks the guard again, in ms. Default `LIVE_RECHECK_MS`. Tests shorten it. */
  liveRecheckMs?: number;
  /** Default: on. Redaction applies either way. */
  logger?: boolean | LogOptions;
  /** Timeouts and `trustProxy`. Default: Fastify's. */
  server?: ServerOptions;
}

/** What every route plugin is registered with. `/claude/*` gets no Ward client on purpose. */
export interface RouteDeps {
  store: Store;
  clock: Clock;
  /** Sends live events to open sockets after a store call succeeded (`features/live/publish.ts`). Never throws. */
  live: LivePublisher;
  /** Sends Web Push for a stored message, after the reply (`features/push/notifier.ts`). Never throws. */
  push: PushNotifier;
}

function loggerOptions(logger: AppDeps["logger"]): FastifyServerOptions["logger"] {
  const setting = logger ?? true;
  if (setting === false) return false;
  const options = setting === true ? {} : setting;
  return {
    level: options.level ?? "info",
    redact: { paths: REDACTED_LOG_PATHS, censor: "[redacted]" },
    ...(options.stream ? { stream: options.stream } : {}),
  };
}

/**
 * The Fastify app, not listening. Tests `inject` into it; `server.ts` listens.
 * It registers in a fixed order:
 *
 * 1. `plugins/errors.ts`: errors leave as the shared `{ error: { code, message } }`,
 *    and an unknown route is a 404 in the same shape;
 * 2. `plugins/json-body.ts`: an empty JSON body is no body;
 * 3. `plugins/auth/`: the `Origin` check on a WebSocket upgrade, the vendored
 *    `wardAuth` session guard (every route but `GET /api/health` and
 *    `/claude/*`), and Satchel's account guard, which sets `request.account`
 *    on `/api/*`. `/claude/*` takes a Claude token instead;
 * 4. `@fastify/websocket`, which serves `GET /api/live` behind the same guard;
 *    the socket re-checks its session while open (`features/live/socket.ts`). The hub
 *    knows who has a socket open; route plugins publish through `RouteDeps.live`;
 * 5. the route plugins, each given `RouteDeps`.
 *
 * Web Push: `RouteDeps.push` notifies the other members' devices of a stored
 * message, after the reply; off unless `push` is passed. Closing the app closes
 * the live sockets first, then waits for the requests in flight and the pushes
 * already started, then closes `db` when it was given.
 */
export async function buildApp({
  store,
  accounts,
  db,
  ward,
  publicOrigin,
  apiPrefix,
  webBase,
  trustedProxies = [],
  clock,
  push: pushOptions,
  liveRecheckMs,
  logger,
  server,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ ...server, logger: loggerOptions(logger), bodyLimit: BODY_LIMIT_BYTES });

  // In a fixed order: the error and 404 handlers, the JSON body parser, then sign-in and the guard, all
  // root-wide, before any route.
  await app.register(errors);
  await app.register(jsonBody);
  await app.register(authPlugin, {
    store,
    accounts,
    ...(ward ? { ward } : {}),
    publicOrigin,
    apiPrefix,
    webBase,
    trustedProxies,
    cookieName: SESSION_COOKIE,
    routePrefix: AUTH_ROUTE_PREFIX,
  });

  // Before the route plugins: it wraps the handlers of routes registered after it. Closing the app closes
  // every open socket first, with a code the web client reconnects on, and cuts a client that doesn't answer.
  await app.register(fastifyWebsocket, {
    options: { maxPayload: LIVE_MAX_PAYLOAD_BYTES, closeTimeout: LIVE_CLOSE_TIMEOUT_MS },
    preClose(done) {
      closeLiveSockets(this.websocketServer);
      done();
    },
  });

  const hub = createHub(app.log);
  const push = pushOptions
    ? createPushNotifier({
        store,
        publicKey: pushOptions.vapid.publicKey,
        send: pushOptions.send ?? webPushSender(pushOptions.vapid),
        log: app.log,
      })
    : pushOff;
  // One hook, so the order holds: Fastify runs onClose hooks last-added first.
  app.addHook("onClose", async () => {
    await push.whenIdle();
    db?.close();
  });
  const deps: RouteDeps = { store, clock, live: createLivePublisher({ hub, store, log: app.log }), push };
  await app.register(healthRoutes);
  await app.register(meRoutes);
  await app.register(conversationRoutes, deps);
  await app.register(tokenRoutes, deps);
  await app.register(pushRoutes, deps);
  await app.register(claudeRoutes, deps);
  await app.register(liveRoutes, {
    hub,
    sessionUrl: `${AUTH_ROUTE_PREFIX}/session`,
    ...(liveRecheckMs ? { recheckMs: liveRecheckMs } : {}),
  });

  return app;
}

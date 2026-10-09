import fastifyWebsocket from "@fastify/websocket";
import { routes } from "@satchel/shared";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Clock } from "./clock.js";
import { registerErrorHandling } from "./errors.js";
import { createHub } from "./live/hub.js";
import { registerUpgradeChecks } from "./live/origin.js";
import { createLivePublisher, type LivePublisher } from "./live/publish.js";
import { LIVE_MAX_PAYLOAD_BYTES } from "./live/socket.js";
import { claudeRoutes } from "./routes/claude.js";
import { conversationRoutes } from "./routes/conversations.js";
import { liveRoutes } from "./routes/live.js";
import { meRoutes } from "./routes/me.js";
import { tokenRoutes } from "./routes/tokens.js";
import type { Store } from "./store.js";
import type { WardClient } from "./ward/client.js";
import { registerWardGuard } from "./ward/guard.js";

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

export interface AppDeps {
  store: Store;
  /** The Ward client. `index.ts` builds the real one from config; tests point one at `fakeWard`. */
  ward: WardClient;
  /** The app's origin as the browser sees it (`WARD_PUBLIC_ORIGIN`). The guard refuses writes from any other. */
  publicOrigin: string;
  clock: Clock;
  /** Default: on, except when `NODE_ENV=test`. Redaction applies either way. */
  logger?: boolean | LogOptions;
}

/** What every route plugin is registered with. `/claude/*` gets no Ward client on purpose. */
export interface RouteDeps {
  store: Store;
  clock: Clock;
  /** Sends live events to open sockets after a store call succeeded (`live/publish.ts`). Never throws. */
  live: LivePublisher;
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
 * - The Ward guard is one root `onRequest` hook that covers every `/api/*`
 *   route except `/api/health`, judged by route pattern (see `ward/guard.ts`).
 *   `/claude/*` never runs it.
 * - Route plugins (`routes/*.ts`) take `RouteDeps`, so later briefs fill them
 *   in without editing this file.
 * - Live updates (brief 12): `@fastify/websocket` serves `GET /api/live`
 *   behind the same guard. A WebSocket upgrade must carry the app's own
 *   `Origin`; that check is a root hook ahead of the guard
 *   (`live/origin.ts`). The hub knows who has a socket open; route plugins
 *   publish through `RouteDeps.live`.
 * - Errors leave as the shared `{ error: { code, message } }` (`errors.ts`).
 */
export function buildApp({ store, ward, publicOrigin, clock, logger }: AppDeps): FastifyInstance {
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
  registerWardGuard(app, { ward, store, publicOrigin });

  app.get(routes.health.path, () => routes.health.response.parse({ ok: true }));

  // Before the route plugins: it wraps the handlers of routes registered after it.
  void app.register(fastifyWebsocket, { options: { maxPayload: LIVE_MAX_PAYLOAD_BYTES } });

  const hub = createHub(app.log);
  const deps: RouteDeps = { store, clock, live: createLivePublisher({ hub, store, log: app.log }) };
  void app.register(meRoutes, deps);
  void app.register(conversationRoutes, deps);
  void app.register(tokenRoutes, deps);
  void app.register(claudeRoutes, deps);
  void app.register(liveRoutes, { hub, ward, clock });

  return app;
}

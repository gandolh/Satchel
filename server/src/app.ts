import { routes } from "@satchel/shared";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Clock } from "./clock.js";
import { registerErrorHandling } from "./errors.js";
import { claudeRoutes } from "./routes/claude.js";
import { conversationRoutes } from "./routes/conversations.js";
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
  clock: Clock;
  /** Default: on, except when `NODE_ENV=test`. Redaction applies either way. */
  logger?: boolean | LogOptions;
}

/** What every route plugin is registered with. `/claude/*` gets no Ward client on purpose. */
export interface RouteDeps {
  store: Store;
  clock: Clock;
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
 * - Errors leave as the shared `{ error: { code, message } }` (`errors.ts`).
 */
export function buildApp({ store, ward, clock, logger }: AppDeps): FastifyInstance {
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
  registerWardGuard(app, { ward, store });

  app.get(routes.health.path, () => routes.health.response.parse({ ok: true }));

  const deps: RouteDeps = { store, clock };
  void app.register(meRoutes, deps);
  void app.register(conversationRoutes, deps);
  void app.register(tokenRoutes, deps);
  void app.register(claudeRoutes, deps);

  return app;
}

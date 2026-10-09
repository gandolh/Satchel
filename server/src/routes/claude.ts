import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../app.js";

/**
 * The Claude routes under `/claude/*` (brief 06).
 *
 * Outside the Ward guard: the guard only covers `/api/*`, so nothing here
 * reads the Ward cookie or calls Ward, and `request.account` is `null`. This
 * plugin authenticates its own requests with the Claude token. Its deps carry
 * no Ward client on purpose. The logger already redacts
 * `req.headers.authorization` and `req.headers.cookie`.
 */
export const claudeRoutes: FastifyPluginAsync<RouteDeps> = async (_app, _deps) => {};

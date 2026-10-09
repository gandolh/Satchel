import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../app.js";

/**
 * The Claude token routes under `/api/claude-tokens` (brief 06).
 *
 * Behind the Ward guard: `signedIn(request)` from `../ward/guard.js` returns
 * `{ subject, username, inboxId }`. A POST with `Content-Type:
 * application/json` and no body arrives with `request.body === undefined`.
 */
export const tokenRoutes: FastifyPluginAsync<RouteDeps> = async (_app, _deps) => {};

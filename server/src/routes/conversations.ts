import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../app.js";

/**
 * The conversation routes under `/api/conversations` (brief 05).
 *
 * Behind the Ward guard: `signedIn(request)` from `../ward/guard.js` returns
 * `{ subject, username, inboxId }`. Throw `ApiError` from `../errors.js` (or
 * call `sendError`) for a shared error; a zod parse error is a 400 and
 * `ClientIdConflict` a 409 without any handling here.
 */
export const conversationRoutes: FastifyPluginAsync<RouteDeps> = async (_app, _deps) => {};

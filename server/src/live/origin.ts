import type { FastifyInstance, FastifyRequest } from "fastify";
import { sendError } from "../errors.js";

/**
 * Two rules for every WebSocket upgrade, on any path.
 *
 * **The `Origin` must be the app's own.** Cross-site WebSocket hijacking: an
 * upgrade is a GET, so the Ward guard's cross-origin write check passes it,
 * and browsers apply no CORS to WebSockets. Any page could open `/api/live`,
 * and on a same-site page the browser attaches the `SameSite=Lax` Ward cookie.
 * So an upgrade must carry an `Origin` that is exactly `publicOrigin`. A
 * missing `Origin` is refused too: browsers always send one on an upgrade, so
 * only a non-browser client omits it, and that client can send the right one.
 * The hook is a root `onRequest` hook added before the Ward guard's, so a
 * refused upgrade never reaches Ward. In local dev the Vite proxy rewrites a
 * same-origin page's `Origin` to `WARD_PUBLIC_ORIGIN` on upgrades too.
 *
 * **A refused upgrade closes its connection.** An upgrade's socket belongs to
 * `@fastify/websocket` from the start, outside the HTTP server's keep-alive
 * handling. `@fastify/websocket` closes it after an answer only when its own
 * `onRequest` hook ran, and a hook that answers first (this one, the guard's
 * 401, 403 and 503) skips that. Left alone, the socket stays open after the
 * error answer until the client goes away, and holds up `app.close()`.
 */

/** Whether the request asks to become a WebSocket. */
export function isWebSocketUpgrade(request: FastifyRequest): boolean {
  return request.headers.upgrade?.toLowerCase() === "websocket";
}

export function registerUpgradeChecks(app: FastifyInstance, publicOrigin: string): void {
  app.addHook("onRequest", async (request, reply) => {
    if (!isWebSocketUpgrade(request)) return;
    // Kept by any error answer a later hook sends. An upgrade that succeeds is hijacked and never sends it.
    void reply.header("connection", "close");
    if (request.headers.origin === publicOrigin) return;
    request.log.warn({ url: request.url, origin: request.headers.origin ?? null }, "cross-origin websocket refused");
    return sendError(reply, "forbidden", "Satchel only opens live updates for its own pages.");
  });

  // Runs once an answer went out, which an upgraded (hijacked) request never sends.
  app.addHook("onResponse", async (request) => {
    if (isWebSocketUpgrade(request)) request.raw.socket.destroy();
  });
}

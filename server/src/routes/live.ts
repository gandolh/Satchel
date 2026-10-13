import { LIVE_PATH } from "@satchel/shared";
import type { FastifyPluginAsync } from "fastify";
import { sendError } from "../errors.js";
import type { Hub } from "../live/hub.js";
import { LIVE_RECHECK_MS, serveLiveSocket, type LiveConnection } from "../live/socket.js";
import { signedIn } from "../auth/guard.js";

export interface LiveRouteDeps {
  hub: Hub;
  /** The plugin's `GET <routePrefix>/session`, as Fastify sees it: the guard's own answer, asked again for an open socket. */
  sessionUrl: string;
  /** Default `LIVE_PING_MS`. */
  pingIntervalMs?: number;
  /** Default `LIVE_RECHECK_MS`. */
  recheckMs?: number;
}

/**
 * `GET /api/live`: one WebSocket per open tab, for live updates (brief 12).
 *
 * Before this route runs, the upgrade has passed the root `Origin` check
 * (`live/origin.ts`) and the session guard, exactly like every other `/api/*`
 * route: the upgrade request carries the session cookie, which is why the
 * cookie's path (`/satchel-api`) covers it. A Claude token is no session, so it
 * can't open a socket.
 *
 * **The socket re-checks its session while it is open** (brief 26). A tab with
 * a live socket makes no HTTP requests (the web client stops polling while
 * live), so without this the guard's 30-second Ward check would never run for
 * it and a revoked Ward session would go on receiving messages for the whole
 * session. Every `LIVE_RECHECK_MS` the socket asks the guard again, through
 * `GET /auth/session` with the cookie it was opened with, so a Ward revoke, a
 * Ward outage, a sign-out, a password change or an unlink ends the socket the
 * same way it ends the next HTTP request. See decisions.md.
 *
 * A plain GET, without the upgrade, is a 400.
 */
export const liveRoutes: FastifyPluginAsync<LiveRouteDeps> = async (
  app,
  { hub, sessionUrl, pingIntervalMs, recheckMs = LIVE_RECHECK_MS },
) => {
  app.route({
    method: "GET",
    url: LIVE_PATH,
    handler: (_request, reply) => sendError(reply, "invalid_request", "Open /api/live as a WebSocket."),
    wsHandler: (socket, request) => {
      const { subject } = signedIn(request);
      const cookie = request.headers.cookie ?? "";
      serveLiveSocket(socket as LiveConnection, {
        subject,
        hub,
        pingIntervalMs,
        recheckMs,
        log: request.log,
        async stillSignedIn() {
          const answer = await app.inject({ method: "GET", url: sessionUrl, headers: { cookie } });
          if (answer.statusCode !== 200) return false;
          const body = answer.json<{ user?: unknown }>();
          return body.user !== null && body.user !== undefined;
        },
      });
    },
  });
};

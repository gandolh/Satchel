import { LIVE_PATH } from "@satchel/shared";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { Clock } from "../clock.js";
import { sendError } from "../errors.js";
import type { Hub } from "../live/hub.js";
import { serveLiveSocket, type LiveConnection } from "../live/socket.js";
import type { WardClient } from "../ward/client.js";
import { WardAuthenticationError } from "../ward/errors.js";
import { signedIn } from "../ward/guard.js";

export interface LiveRouteDeps {
  hub: Hub;
  /** Only to read the access token's `exp`; the guard already authenticated the request. */
  ward: WardClient;
  clock: Clock;
  /** Default `LIVE_PING_MS`. */
  pingIntervalMs?: number;
}

/**
 * `GET /api/live`: one WebSocket per open tab, for live updates (brief 12).
 *
 * Before this route runs, the upgrade has passed the root `Origin` check
 * (`live/origin.ts`) and the Ward guard, exactly like every other `/api/*`
 * route: the upgrade request carries the Ward cookie. A Claude token is no
 * Ward session, so it can't open a socket. The socket lives until the
 * access token it was opened with expires (`live/socket.ts`).
 *
 * A plain GET, without the upgrade, is a 400.
 */
export const liveRoutes: FastifyPluginAsync<LiveRouteDeps> = async (app, { hub, ward, clock, pingIntervalMs }) => {
  const expiresAt = new WeakMap<FastifyRequest, number>();

  app.route({
    method: "GET",
    url: LIVE_PATH,
    // Runs after the guard and before the upgrade. Verifying again is local
    // (the key set is cached) and gives the token's own `exp`; `authenticate`
    // returns the session, not the claims.
    preHandler: async (request) => {
      const token = ward.readAccessCookie(request.headers.cookie);
      if (token === undefined) throw new WardAuthenticationError("no access token presented");
      const { exp } = await ward.verify(token);
      expiresAt.set(request, exp * 1000);
    },
    handler: (_request, reply) => sendError(reply, "invalid_request", "Open /api/live as a WebSocket."),
    wsHandler: (socket, request) => {
      const { subject } = signedIn(request);
      serveLiveSocket(socket as LiveConnection, {
        subject,
        hub,
        expiresAt: expiresAt.get(request) ?? clock().getTime(),
        clock,
        pingIntervalMs,
        log: request.log,
      });
    },
  });
};

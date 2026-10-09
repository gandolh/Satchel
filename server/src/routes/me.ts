import { routes } from "@satchel/shared";
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../app.js";
import { signedIn } from "../ward/guard.js";

/** `GET /api/me`: who is signed in, and their Ideas inbox. Behind the Ward guard. */
export const meRoutes: FastifyPluginAsync<RouteDeps> = async (app) => {
  app.get(routes.me.path, (request) => {
    const { subject, username, inboxId } = signedIn(request);
    return routes.me.response.parse({ subject, displayName: username, inboxId });
  });
};

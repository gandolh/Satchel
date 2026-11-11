import { routes } from "@satchel/shared";
import type { FastifyPluginAsync } from "fastify";
import { signedIn } from "../../plugins/auth/guard.js";

/** `GET /api/me`: who is signed in, and their Ideas inbox (null for a friend, who has none). Behind the session guard. */
export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get(routes.me.path, (request) => {
    const { subject, username, inboxId } = signedIn(request);
    return routes.me.response.parse({ subject, displayName: username, inboxId });
  });
};

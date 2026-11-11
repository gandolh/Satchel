import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { routes } from "@satchel/shared";
import { signedIn } from "../../plugins/auth/guard.js";

/** `GET /api/me`: who is signed in, and their Ideas inbox (null for a friend, who has none). Behind the session guard. */
export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(routes.me.path, { schema: { response: { 200: routes.me.response } } }, (request) => {
    const { subject, username, inboxId } = signedIn(request);
    return { subject, displayName: username, inboxId };
  });
};

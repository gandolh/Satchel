import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { routes } from "@satchel/shared";

/** `GET /api/health`: open to anyone (`wardAuth`'s `publicRoutes`), for the container's health check. */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(routes.health.path, { schema: { response: { 200: routes.health.response } } }, () => ({
    ok: true as const,
  }));
};

import { routes } from "@satchel/shared";
import type { FastifyPluginAsync } from "fastify";

/** `GET /api/health`: open to anyone (`wardAuth`'s `publicRoutes`), for the container's health check. */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(routes.health.path, () => routes.health.response.parse({ ok: true }));
};

import {
  serializerCompiler,
  validatorCompiler,
  type FastifyPluginAsyncZod,
  type ZodTypeProvider,
} from "@fastify/type-provider-zod";
import Fastify, { type FastifySchema } from "fastify";

/**
 * The schema each route of one feature declares, by `"METHOD /path"`; a route
 * with none is missing from the result. The feature is registered alone on a
 * bare Fastify with the zod compilers, as `buildApp` registers it. No route is
 * called, so its options may be stand-ins.
 *
 *     expect(await routeSchemas(meRoutes, {})).toEqual({ "GET /api/me": { response: { 200: meResponseSchema } } });
 */
export async function routeSchemas<Options extends Record<string, unknown>>(
  plugin: FastifyPluginAsyncZod<Options>,
  options: Options,
): Promise<Record<string, FastifySchema>> {
  const app = Fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  const schemas: Record<string, FastifySchema> = {};
  app.addHook("onRoute", (route) => {
    // The HEAD twin of a GET is Fastify's own, with the GET's schema.
    if (route.schema === undefined) return;
    // Only the parts a route declares: Fastify marks the object it was given with a symbol of its own.
    const { params, querystring, body, headers, response } = route.schema;
    const declared = Object.fromEntries(
      Object.entries({ params, querystring, body, headers, response }).filter(([, part]) => part !== undefined),
    );
    for (const method of [route.method].flat()) if (method !== "HEAD") schemas[`${method} ${route.url}`] = declared;
  });
  await app.register(plugin, options);
  await app.ready();
  await app.close();
  return schemas;
}

import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

/**
 * A POST with `Content-Type: application/json` and no body is a body of
 * `undefined`, not a 400: the token routes take no body and a client may still
 * send the header. Everything else goes to Fastify's own parser, which keeps
 * its prototype-poisoning checks and its 400 for bad JSON.
 */
const jsonBodyParser: FastifyPluginAsync = async (app) => {
  const parseJson = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    if (body === "") {
      done(null, undefined);
      return;
    }
    // Fastify types the default parser as a callback or a promise; this call uses the callback, which
    // reports the result through `done`, so there is no promise to await.
    void parseJson(request, body as string, done);
  });
};

/** Wrapped in fastify-plugin, so the parser is the root's and every route uses it. */
export const jsonBody = fp(jsonBodyParser, { name: "satchel-json-body" });

import { routes } from "@satchel/shared";
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../app.js";
import { ApiError } from "../errors.js";
import { signedIn } from "../ward/guard.js";

/**
 * The Claude token routes under `/api/claude-tokens` (brief 06).
 *
 * Behind the Ward guard: `signedIn(request)` from `../ward/guard.js` returns
 * `{ subject, username, inboxId }`. A POST with `Content-Type:
 * application/json` and no body arrives with `request.body === undefined`;
 * create and revoke take no body and ignore one if sent.
 *
 * Only `POST /api/claude-tokens` ever carries a token, once. The list is the
 * strict summary shape, so a token or hash in it fails validation.
 */
export const tokenRoutes: FastifyPluginAsync<RouteDeps> = async (app, { store }) => {
  app.get(routes.listClaudeTokens.path, (request) => {
    const { subject } = signedIn(request);
    return routes.listClaudeTokens.response.parse({ tokens: store.listClaudeTokens(subject) });
  });

  app.post(routes.createClaudeToken.path, (request, reply) => {
    const { subject } = signedIn(request);
    const created = routes.createClaudeToken.response.parse(store.createClaudeToken(subject));
    return reply.code(201).header("cache-control", "no-store").send(created);
  });

  app.post(routes.revokeClaudeToken.path, (request) => {
    const { subject } = signedIn(request);
    const { id } = routes.revokeClaudeToken.params.parse(request.params);
    const revoked = store.revokeClaudeToken(subject, id);
    if (revoked === null) throw new ApiError("not_found", "No such Claude token.");
    return routes.revokeClaudeToken.response.parse(revoked);
  });
};

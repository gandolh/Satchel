import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { routes } from "@satchel/shared";
import type { Store } from "../../db/store.js";
import { ApiError } from "../../lib/api-error.js";
import { requireOwner } from "../../plugins/auth/guard.js";

/** The 403 a friend gets from every route here. */
export const OWNER_ONLY_MESSAGE = "Only Satchel's owner can connect Claude.";

/** What the token routes take from the app's `RouteDeps`. */
export interface TokenRoutesOptions {
  store: Store;
}

/**
 * The Claude token routes under `/api/claude-tokens`.
 *
 * Behind the session guard, and owner-only: every route here is a 403
 * `forbidden` for an account without the `admin` role, so a friend can neither
 * see tokens nor create the inbox one would be bound to (decisions.md, "The
 * Ideas inbox is owner-only"). The one thing checked first is the route's
 * schema: a malformed token id is a 400 for anyone. A POST with
 * `Content-Type: application/json` and no body arrives with
 * `request.body === undefined`; create and revoke take no body and ignore one
 * if sent.
 *
 * Only `POST /api/claude-tokens` ever carries a token, once. The list's
 * response schema is the strict summary shape, so a token or hash in a row
 * fails it: a 500, never a reply that carries it.
 */
export const tokenRoutes: FastifyPluginAsyncZod<TokenRoutesOptions> = async (app, { store }) => {
  app.get(
    routes.listClaudeTokens.path,
    { schema: { response: { 200: routes.listClaudeTokens.response } } },
    (request) => {
      const { subject } = requireOwner(request, OWNER_ONLY_MESSAGE);
      return { tokens: store.listClaudeTokens(subject) };
    },
  );

  app.post(
    routes.createClaudeToken.path,
    { schema: { response: { 201: routes.createClaudeToken.response } } },
    (request, reply) => {
      const { subject } = requireOwner(request, OWNER_ONLY_MESSAGE);
      void reply.code(201).header("cache-control", "no-store");
      return store.createClaudeToken(subject);
    },
  );

  app.post(
    routes.revokeClaudeToken.path,
    { schema: { params: routes.revokeClaudeToken.params, response: { 200: routes.revokeClaudeToken.response } } },
    (request) => {
      const { subject } = requireOwner(request, OWNER_ONLY_MESSAGE);
      const revoked = store.revokeClaudeToken(subject, request.params.id);
      if (revoked === null) throw new ApiError("not_found", "No such Claude token.");
      return revoked;
    },
  );
};

import { CLAUDE_MEMBER, routes } from "@satchel/shared";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { RouteDeps } from "../app.js";
import { sendError } from "../errors.js";
import type { ResolvedClaudeToken } from "../store.js";

/**
 * The Claude routes under `/claude/*` (brief 06).
 *
 * Outside the Ward guard: the guard only covers `/api/*`, so nothing here
 * reads the Ward cookie or calls Ward, and `request.account` is `null`. This
 * plugin authenticates its own requests with the Claude token. Its deps carry
 * no Ward client on purpose. The logger already redacts
 * `req.headers.authorization` and `req.headers.cookie`; nothing here logs the
 * token or the header.
 *
 * A Claude token reaches its own Ideas inbox and nothing else: every handler
 * takes the conversation id from the resolved token. No route reads a
 * conversation id from the request.
 */

/** The one answer for a missing, malformed, unknown or revoked Claude token. */
export const UNKNOWN_CLAUDE_TOKEN_MESSAGE =
  "Unknown or revoked Claude token. Create a new one in Satchel under Settings → Connect Claude.";

// `Authorization: Bearer <token>`. The scheme is case-insensitive (RFC 7235).
const BEARER = /^Bearer +(\S+) *$/i;

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the bearer hook on `/claude/*`. Never set on any other route. */
    claudeToken: ResolvedClaudeToken | null;
  }
}

/** The resolved token on a `/claude/*` route. Throws (a 500) outside the hook, which is a bug. */
function claudeToken(request: FastifyRequest): ResolvedClaudeToken {
  if (!request.claudeToken) {
    throw new Error("claudeToken() was called on a route the bearer hook does not cover");
  }
  return request.claudeToken;
}

export const claudeRoutes: FastifyPluginAsync<RouteDeps> = async (app, { store }) => {
  app.decorateRequest("claudeToken", null);

  // Scoped to this plugin's routes. `onRequest` runs before the body is
  // parsed, so a caller without a token gets nothing past this line.
  app.addHook("onRequest", async (request, reply) => {
    const header = request.headers.authorization;
    const token = typeof header === "string" ? BEARER.exec(header)?.[1] : undefined;
    const resolved = token === undefined ? null : store.resolveClaudeToken(token);
    if (resolved === null) {
      reply.header("www-authenticate", "Bearer");
      return sendError(reply, "unauthorized", UNKNOWN_CLAUDE_TOKEN_MESSAGE);
    }
    request.claudeToken = resolved;
  });

  // Changes nothing: reading and marking are separate calls (messages-and-seen.md).
  app.get(routes.claudeUnread.path, (request) => {
    const { conversationId } = claudeToken(request);
    const seenUpTo = store.seenUpTo(conversationId, CLAUDE_MEMBER);
    const messages = store
      .unreadFor(conversationId, CLAUDE_MEMBER)
      .map(({ seq, sentAt, text }) => ({ seq, sentAt, text }));
    return routes.claudeUnread.response.parse({ seenUpTo, messages });
  });

  app.post(routes.claudeSeen.path, (request) => {
    const { conversationId } = claudeToken(request);
    const { upTo } = routes.claudeSeen.body.parse(request.body);
    const seenUpTo = store.markSeen(conversationId, CLAUDE_MEMBER, upTo);
    return routes.claudeSeen.response.parse({ seenUpTo });
  });

  app.get(routes.claudeMessages.path, (request) => {
    const { conversationId } = claudeToken(request);
    const { after, since, limit } = routes.claudeMessages.query.parse(request.query);
    const seenUpTo = store.seenUpTo(conversationId, CLAUDE_MEMBER);
    const messages = store
      .listMessages(conversationId, { after, since, limit })
      .map(({ seq, sentAt, text }) => ({ seq, sentAt, text, seen: seq <= seenUpTo }));
    return routes.claudeMessages.response.parse({ messages });
  });
};

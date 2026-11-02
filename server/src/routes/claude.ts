import { CLAUDE_MEMBER, routes } from "@satchel/shared";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { RouteDeps } from "../app.js";
import { sendError } from "../errors.js";
import type { ResolvedClaudeToken } from "../store.js";

/**
 * The Claude routes under `/claude/*`.
 *
 * Outside the session guard: `wardAuth` is told these routes are public, so
 * nothing here reads the session cookie or calls Ward, and `request.account`
 * is `null`. This plugin authenticates its own requests with the Claude token.
 * Its deps carry no accounts or Ward client on purpose. The logger already redacts
 * `req.headers.authorization` and `req.headers.cookie`; nothing here logs the
 * token or the header.
 *
 * A Claude token reaches its own Ideas inbox and nothing else: every handler
 * takes the conversation id from the resolved token. No route reads a
 * conversation id from the request, for writing (`POST /claude/messages`)
 * as for reading.
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

export const claudeRoutes: FastifyPluginAsync<RouteDeps> = async (app, { store, live, push }) => {
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
    const before = store.seenUpTo(conversationId, CLAUDE_MEMBER);
    const seenUpTo = store.markSeen(conversationId, CLAUDE_MEMBER, upTo);
    // The owner's sockets, so the ticks turn blue while they watch.
    if (seenUpTo !== before) live.seenMoved(conversationId, CLAUDE_MEMBER);
    return routes.claudeSeen.response.parse({ seenUpTo });
  });

  app.get(routes.claudeMessages.path, (request) => {
    const { conversationId } = claudeToken(request);
    const { after, since, limit } = routes.claudeMessages.query.parse(request.query);
    const seenUpTo = store.seenUpTo(conversationId, CLAUDE_MEMBER);
    const messages = store
      .listMessages(conversationId, { after, since, limit })
      .map(({ seq, sentAt, text, sender }) => ({
        seq,
        sentAt,
        text,
        seen: seq <= seenUpTo,
        fromClaude: sender === CLAUDE_MEMBER,
      }));
    return routes.claudeMessages.response.parse({ messages });
  });

  /*
   * Claude replies in the inbox: an ordinary send with the
   * conversation from the token and `CLAUDE_MEMBER` as the sender. The body
   * names no conversation; anything extra in it or the query is ignored. The
   * owner sees it live and gets a push, like any message.
   *
   * Unlike a person's send, it leaves Claude's seen marker where it is: only
   * `POST /claude/seen` moves it, with the number of the last message Claude
   * printed, so a message the owner sends between Claude's read and its reply
   * stays unread for Claude (decisions.md, "Reading and marking seen are two
   * calls").
   */
  app.post(routes.claudeReply.path, (request, reply) => {
    const { conversationId } = claudeToken(request);
    const { clientId, text } = routes.claudeReply.body.parse(request.body);
    const { message, created } = store.appendMessage({
      conversationId,
      sender: CLAUDE_MEMBER,
      clientId,
      text,
      markSenderSeen: false,
    });
    if (created) {
      live.messageStored(message);
      push.messageStored(message);
    }
    reply.code(created ? 201 : 200);
    return routes.claudeReply.response.parse({
      message: { seq: message.seq, sentAt: message.sentAt, text: message.text },
    });
  });
};

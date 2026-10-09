import { routes } from "@satchel/shared";
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../app.js";
import { ApiError } from "../errors.js";
import { signedIn } from "../ward/guard.js";

/**
 * The conversation routes (brief 05). Behind the Ward guard. A conversation
 * the caller is not a member of is a 404, the same as one that does not exist.
 */
export const conversationRoutes: FastifyPluginAsync<RouteDeps> = async (app, { store }) => {
  const notFound = () => new ApiError("not_found", "No such conversation");

  app.get(routes.listConversations.path, (request) => {
    const { subject } = signedIn(request);
    return routes.listConversations.response.parse({ conversations: store.listConversations(subject) });
  });

  app.get(routes.listMessages.path, (request) => {
    const { subject } = signedIn(request);
    const { id } = routes.listMessages.params.parse(request.params);
    const { after, limit } = routes.listMessages.query.parse(request.query);
    const conversation = store.getConversation(id, subject);
    if (!conversation) throw notFound();
    return routes.listMessages.response.parse({
      conversation,
      messages: store.listMessages(id, { after, limit }),
      latestSeq: store.latestSeq(id),
    });
  });

  app.post(routes.sendMessage.path, (request, reply) => {
    const { subject } = signedIn(request);
    const { id } = routes.sendMessage.params.parse(request.params);
    const { clientId, text } = routes.sendMessage.body.parse(request.body);
    if (!store.getConversation(id, subject)) throw notFound();
    const { message, created } = store.appendMessage({
      conversationId: id,
      sender: subject,
      clientId,
      text,
    });
    reply.code(created ? 201 : 200);
    return routes.sendMessage.response.parse({ message });
  });

  app.post(routes.markSeen.path, (request) => {
    const { subject } = signedIn(request);
    const { id } = routes.markSeen.params.parse(request.params);
    const { upTo } = routes.markSeen.body.parse(request.body);
    if (!store.getConversation(id, subject)) throw notFound();
    return routes.markSeen.response.parse({ seenUpTo: store.markSeen(id, subject, upTo) });
  });
};

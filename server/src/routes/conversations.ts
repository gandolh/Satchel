import { routes } from "@satchel/shared";
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../app.js";
import { ApiError } from "../errors.js";
import { UnknownAccount } from "../store.js";
import { signedIn } from "../ward/guard.js";

/**
 * The conversation routes (briefs 05 and 11). Behind the Ward guard. A
 * conversation the caller is not a member of is a 404, the same as one that
 * does not exist.
 *
 * `GET /api/people` and `POST /api/conversations` are for everyone with a
 * Satchel grant, owner and friends alike. Creating never makes an inbox: the
 * body's `kind` is `direct` or `group` only, and Claude is never an account,
 * so no friend conversation has Claude as a member.
 *
 * Live events (brief 12) go out after the store call succeeded and only when
 * something changed: a stored message (not a repeated client ID), a marker
 * that moved, a conversation that was created (not an existing direct one).
 */
export const conversationRoutes: FastifyPluginAsync<RouteDeps> = async (app, { store, live }) => {
  const notFound = () => new ApiError("not_found", "No such conversation");

  /** Runs a store call that names other subjects; one with no account is a 400. */
  function withKnownPeople<T>(create: () => T): T {
    try {
      return create();
    } catch (error) {
      if (error instanceof UnknownAccount) {
        throw new ApiError("invalid_request", "That person hasn't signed in to Satchel yet.");
      }
      throw error;
    }
  }

  app.get(routes.listConversations.path, (request) => {
    const { subject } = signedIn(request);
    return routes.listConversations.response.parse({ conversations: store.listConversations(subject) });
  });

  app.get(routes.listPeople.path, (request) => {
    const { subject } = signedIn(request);
    return routes.listPeople.response.parse({ people: store.listPeople(subject) });
  });

  // Direct: 201 when made, 200 when the pair already had one. Group: 201.
  app.post(routes.createConversation.path, (request, reply) => {
    const { subject } = signedIn(request);
    const body = routes.createConversation.body.parse(request.body);

    if (body.kind === "direct") {
      if (body.with === subject) throw new ApiError("invalid_request", "A chat needs someone other than you.");
      const made = withKnownPeople(() => store.createDirect(subject, body.with));
      if (made.created) live.conversationCreated(made.conversation.id, subject);
      reply.code(made.created ? 201 : 200);
      return routes.createConversation.response.parse({ conversation: made.conversation });
    }

    if (body.members.includes(subject)) {
      throw new ApiError("invalid_request", "Leave yourself out of the members; you're added to the group anyway.");
    }
    const conversation = withKnownPeople(() => store.createGroup(subject, body.title, body.members));
    live.conversationCreated(conversation.id, subject);
    reply.code(201);
    return routes.createConversation.response.parse({ conversation });
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
    if (created) live.messageStored(message);
    reply.code(created ? 201 : 200);
    return routes.sendMessage.response.parse({ message });
  });

  app.post(routes.markSeen.path, (request) => {
    const { subject } = signedIn(request);
    const { id } = routes.markSeen.params.parse(request.params);
    const { upTo } = routes.markSeen.body.parse(request.body);
    const conversation = store.getConversation(id, subject);
    if (!conversation) throw notFound();
    const before = conversation.members.find((member) => member.id === subject)?.seenUpTo;
    const seenUpTo = store.markSeen(id, subject, upTo);
    if (seenUpTo !== before) live.seenMoved(id, subject);
    return routes.markSeen.response.parse({ seenUpTo });
  });
};

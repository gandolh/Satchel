import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { routes } from "@satchel/shared";
import { InactiveAccount, UnknownAccount, type Store } from "../../db/store.js";
import { ApiError } from "../../lib/api-error.js";
import { signedIn } from "../../plugins/auth/guard.js";
import type { LivePublisher } from "../live/index.js";
import type { PushNotifier } from "../push/index.js";

/** What the conversation routes take from the app's `RouteDeps`. */
export interface ConversationRoutesOptions {
  store: Store;
  live: LivePublisher;
  push: PushNotifier;
}

/**
 * The conversation routes. Behind the session guard. A
 * conversation the caller is not a member of is a 404, the same as one that
 * does not exist.
 *
 * `GET /api/people` and `POST /api/conversations` are for everyone with a
 * Satchel grant, owner and friends alike. Creating never makes an inbox: the
 * body's `kind` is `direct` or `group` only, and Claude is never an account,
 * so no friend conversation has Claude as a member.
 *
 * Live events go out after the store call succeeded and only when
 * something changed: a stored message (not a repeated client ID), a marker
 * that moved, a conversation that was created (not an existing direct one).
 * A stored message also goes out as Web Push to the other members'
 * devices, after the reply; a push failure never touches the response.
 *
 * Each route declares the contract's schemas, so a request that fails one is a
 * 400 before the handler runs, and a reply carries only the fields its schema
 * names.
 */
export const conversationRoutes: FastifyPluginAsyncZod<ConversationRoutesOptions> = async (
  app,
  { store, live, push },
) => {
  const notFound = () => new ApiError("not_found", "No such conversation");

  /**
   * Runs a store call that names other subjects. One with no account, or one
   * whose account lost its Satchel grant, is a 400.
   */
  function withKnownPeople<T>(create: () => T): T {
    try {
      return create();
    } catch (error) {
      if (error instanceof UnknownAccount) {
        throw new ApiError("invalid_request", "That person hasn't signed in to Satchel yet.");
      }
      if (error instanceof InactiveAccount) {
        throw new ApiError("invalid_request", "That person no longer has access to Satchel.");
      }
      throw error;
    }
  }

  app.get(
    routes.listConversations.path,
    { schema: { response: { 200: routes.listConversations.response } } },
    (request) => {
      const { subject } = signedIn(request);
      return { conversations: store.listConversations(subject) };
    },
  );

  app.get(routes.listPeople.path, { schema: { response: { 200: routes.listPeople.response } } }, (request) => {
    const { subject } = signedIn(request);
    return { people: store.listPeople(subject) };
  });

  // Direct: 201 when made, 200 when the pair already had one. Group: 201.
  app.post(
    routes.createConversation.path,
    {
      schema: {
        body: routes.createConversation.body,
        response: { 200: routes.createConversation.response, 201: routes.createConversation.response },
      },
    },
    (request, reply) => {
      const { subject } = signedIn(request);
      const body = request.body;

      if (body.kind === "direct") {
        if (body.with === subject) throw new ApiError("invalid_request", "A chat needs someone other than you.");
        const made = withKnownPeople(() => store.createDirect(subject, body.with));
        if (made.created) live.conversationCreated(made.conversation.id, subject);
        void reply.code(made.created ? 201 : 200);
        return { conversation: made.conversation };
      }

      if (body.members.includes(subject)) {
        throw new ApiError("invalid_request", "Leave yourself out of the members; you're added to the group anyway.");
      }
      const conversation = withKnownPeople(() => store.createGroup(subject, body.title, body.members));
      live.conversationCreated(conversation.id, subject);
      void reply.code(201);
      return { conversation };
    },
  );

  app.get(
    routes.listMessages.path,
    {
      schema: {
        params: routes.listMessages.params,
        querystring: routes.listMessages.query,
        response: { 200: routes.listMessages.response },
      },
    },
    (request) => {
      const { subject } = signedIn(request);
      const { id } = request.params;
      const { after, limit } = request.query;
      const conversation = store.getConversation(id, subject);
      if (!conversation) throw notFound();
      return { conversation, messages: store.listMessages(id, { after, limit }), latestSeq: store.latestSeq(id) };
    },
  );

  app.post(
    routes.sendMessage.path,
    {
      schema: {
        params: routes.sendMessage.params,
        body: routes.sendMessage.body,
        response: { 200: routes.sendMessage.response, 201: routes.sendMessage.response },
      },
    },
    (request, reply) => {
      const { subject } = signedIn(request);
      const { id } = request.params;
      const { clientId, text } = request.body;
      if (!store.getConversation(id, subject)) throw notFound();
      const { message, created } = store.appendMessage({
        conversationId: id,
        sender: subject,
        clientId,
        text,
      });
      if (created) {
        live.messageStored(message);
        push.messageStored(message);
      }
      void reply.code(created ? 201 : 200);
      return { message };
    },
  );

  app.post(
    routes.markSeen.path,
    {
      schema: {
        params: routes.markSeen.params,
        body: routes.markSeen.body,
        response: { 200: routes.markSeen.response },
      },
    },
    (request) => {
      const { subject } = signedIn(request);
      const { id } = request.params;
      const { upTo } = request.body;
      const conversation = store.getConversation(id, subject);
      if (!conversation) throw notFound();
      const before = conversation.members.find((member) => member.id === subject)?.seenUpTo;
      const seenUpTo = store.markSeen(id, subject, upTo);
      if (seenUpTo !== before) live.seenMoved(id, subject);
      return { seenUpTo };
    },
  );
};

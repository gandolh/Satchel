import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { routes } from "@satchel/shared";
import type { Store } from "../../db/store.js";
import { ApiError } from "../../lib/api-error.js";
import { signedIn } from "../../plugins/auth/guard.js";
import type { PushNotifier } from "./notifier.js";

/** What the push routes take from the app's `RouteDeps`. */
export interface PushRoutesOptions {
  store: Store;
  push: PushNotifier;
}

/**
 * The push routes under `/api/push`. Behind the session guard, for
 * owner and friends alike; the POST and DELETE pass its cross-site write
 * check like every other write.
 *
 * With push off (no VAPID keys) there is no key to hand out and nothing to
 * subscribe to, so `GET /api/push/key` and `POST /api/push/subscriptions` are
 * 404. A malformed subscription is a 400 first: the route's schema runs before
 * the handler. Deleting still works, so a browser can always clean up after
 * itself.
 */
export const pushRoutes: FastifyPluginAsyncZod<PushRoutesOptions> = async (app, { store, push }) => {
  const pushOff = () => new ApiError("not_found", "Push notifications are off on this server.");

  app.get(routes.pushKey.path, { schema: { response: { 200: routes.pushKey.response } } }, (request) => {
    signedIn(request);
    if (push.publicKey === null) throw pushOff();
    return { publicKey: push.publicKey };
  });

  // 201 for a new endpoint, 200 for one already stored (now the caller's, with the new keys).
  app.post(
    routes.savePushSubscription.path,
    {
      schema: {
        body: routes.savePushSubscription.body,
        response: { 200: routes.savePushSubscription.response, 201: routes.savePushSubscription.response },
      },
    },
    (request, reply) => {
      const { subject } = signedIn(request);
      if (push.publicKey === null) throw pushOff();
      const { endpoint, keys } = request.body;
      const { created } = store.savePushSubscription(subject, { endpoint, p256dh: keys.p256dh, auth: keys.auth });
      void reply.code(created ? 201 : 200);
      return { ok: true as const };
    },
  );

  // Only the caller's own. Someone else's endpoint, or one already gone, is still a 200.
  app.delete(
    routes.deletePushSubscription.path,
    {
      schema: {
        body: routes.deletePushSubscription.body,
        response: { 200: routes.deletePushSubscription.response },
      },
    },
    (request) => {
      const { subject } = signedIn(request);
      store.deletePushSubscription(subject, request.body.endpoint);
      return { ok: true as const };
    },
  );
};

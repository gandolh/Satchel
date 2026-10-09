import { routes } from "@satchel/shared";
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../app.js";
import { ApiError } from "../errors.js";
import { signedIn } from "../ward/guard.js";

/**
 * The push routes under `/api/push` (brief 14). Behind the Ward guard, for
 * owner and friends alike; the POST and DELETE pass its cross-site write
 * check like every other write.
 *
 * With push off (no VAPID keys) there is no key to hand out and nothing to
 * subscribe to, so `GET /api/push/key` and `POST /api/push/subscriptions` are
 * 404. Deleting still works, so a browser can always clean up after itself.
 */
export const pushRoutes: FastifyPluginAsync<RouteDeps> = async (app, { store, push }) => {
  const pushOff = () => new ApiError("not_found", "Push notifications are off on this server.");

  app.get(routes.pushKey.path, (request) => {
    signedIn(request);
    if (push.publicKey === null) throw pushOff();
    return routes.pushKey.response.parse({ publicKey: push.publicKey });
  });

  // 201 for a new endpoint, 200 for one already stored (now the caller's, with the new keys).
  app.post(routes.savePushSubscription.path, (request, reply) => {
    const { subject } = signedIn(request);
    if (push.publicKey === null) throw pushOff();
    const { endpoint, keys } = routes.savePushSubscription.body.parse(request.body);
    const { created } = store.savePushSubscription(subject, { endpoint, p256dh: keys.p256dh, auth: keys.auth });
    reply.code(created ? 201 : 200);
    return routes.savePushSubscription.response.parse({ ok: true });
  });

  // Only the caller's own. Someone else's endpoint, or one already gone, is still a 200.
  app.delete(routes.deletePushSubscription.path, (request) => {
    const { subject } = signedIn(request);
    const { endpoint } = routes.deletePushSubscription.body.parse(request.body);
    store.deletePushSubscription(subject, endpoint);
    return routes.deletePushSubscription.response.parse({ ok: true });
  });
};

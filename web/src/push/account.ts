import { deletePushSubscription, savePushSubscription } from "../api";
import { appBase } from "../base";
import { subscriptionBody } from "./subscription";

/**
 * Keeping this browser's push subscription tied to the account that is signed
 * in, on a browser more than one person may use. Everything here is best
 * effort: it never throws, and never holds up sign-in or sign-out.
 */

/** The longest sign-out waits on the push cleanup. */
export const SIGN_OUT_PUSH_MS = 2000;
/** The server call inside that wait, so it gives up before the wait does. */
const DELETE_TIMEOUT_MS = 1500;

/** The part of a `PushSubscription` used here. */
export interface SubscriptionLike {
  endpoint: string;
  toJSON(): PushSubscriptionJSON;
  unsubscribe(): Promise<boolean>;
}

export interface PushAccountDeps {
  /** This browser's existing subscription, without waiting for a worker to install. */
  current(): Promise<SubscriptionLike | null>;
  permission(): NotificationPermission;
  save: typeof savePushSubscription;
  forget(endpoint: string): Promise<unknown>;
}

/** Resolves with `promise`'s result, or `undefined` once `ms` pass or it fails. */
export async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([promise.catch(() => undefined), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Whether a signed-in start should re-save the subscription: allowed, and one exists. */
export function shouldRebind(permission: NotificationPermission, subscription: unknown): boolean {
  return permission === "granted" && subscription !== null && subscription !== undefined;
}

async function currentSubscription(): Promise<SubscriptionLike | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration(appBase());
  return (await registration?.pushManager.getSubscription()) ?? null;
}

const browserDeps: PushAccountDeps = {
  current: currentSubscription,
  permission: () => (typeof Notification === "undefined" ? "denied" : Notification.permission),
  save: savePushSubscription,
  forget: (endpoint) => deletePushSubscription(endpoint, { signal: AbortSignal.timeout(DELETE_TIMEOUT_MS) }),
};

/**
 * Before signing out: tell the server to drop this browser's subscription and
 * unsubscribe it, so the next person on a shared browser doesn't see the
 * previous account's previews. Waits at most `SIGN_OUT_PUSH_MS`.
 */
export async function forgetPushSubscription(
  deps: PushAccountDeps = browserDeps,
  ms: number = SIGN_OUT_PUSH_MS,
): Promise<void> {
  await withDeadline(
    (async () => {
      const subscription = await deps.current();
      if (subscription === null) return;
      await Promise.allSettled([deps.forget(subscription.endpoint), subscription.unsubscribe()]);
    })(),
    ms,
  );
}

/** After sign-in: save an existing subscription again so the server binds it to this account. */
export async function rebindPushSubscription(deps: PushAccountDeps = browserDeps): Promise<void> {
  try {
    if (deps.permission() !== "granted") return;
    const subscription = await deps.current();
    if (!shouldRebind(deps.permission(), subscription) || subscription === null) return;
    const body = subscriptionBody(subscription.toJSON());
    if (body) await deps.save(body);
  } catch {
    // Not worth interrupting anything: Settings → Notifications saves it again.
  }
}

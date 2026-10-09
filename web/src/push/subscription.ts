import type { SavePushSubscriptionRequest } from "@satchel/shared";
import { appBase } from "../base";

/**
 * This browser's side of Web Push (brief 14): can it, and its subscription.
 * The pure parts are exported for tests; the rest touches `navigator`.
 */

/** What the Notifications card can offer on this device. */
export type PushSupport =
  /** Push works here; ask the server and the browser for the rest. */
  | "ok"
  /** An iPhone or iPad in a Safari tab: push needs the Home Screen app. */
  | "ios-home-screen"
  /** The Home Screen app on an iOS older than 16.4, which has no web push. */
  | "ios-update"
  /** Anything else without service workers, Push or notifications. */
  | "unsupported";

/** The bits of `navigator` and `window` that decide `PushSupport`. */
export interface PushEnvironment {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** Running as an installed app (`display-mode: standalone`, or iOS's `navigator.standalone`). */
  standalone: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
}

/** iPhone, iPod or iPad, including iPadOS, which reports itself as a Mac with a touch screen. */
export function isIos(env: Pick<PushEnvironment, "userAgent" | "platform" | "maxTouchPoints">): boolean {
  return /iPad|iPhone|iPod/.test(env.userAgent) || (env.platform === "MacIntel" && env.maxTouchPoints > 1);
}

export function pushSupport(env: PushEnvironment): PushSupport {
  const capable = env.serviceWorker && env.pushManager && env.notification;
  if (isIos(env)) {
    if (!env.standalone) return "ios-home-screen";
    return capable ? "ok" : "ios-update";
  }
  return capable ? "ok" : "unsupported";
}

export function readEnvironment(): PushEnvironment {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    standalone: window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
    serviceWorker: "serviceWorker" in nav,
    pushManager: "PushManager" in window,
    notification: "Notification" in window,
  };
}

/** A VAPID public key (base64url) as the bytes `pushManager.subscribe` wants. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Whether a subscription was made with `key`: after the server's keys change, the old one is useless. */
export function sameKey(current: ArrayBuffer | null, key: Uint8Array): boolean {
  if (current === null || current.byteLength !== key.byteLength) return false;
  const bytes = new Uint8Array(current);
  return bytes.every((byte, i) => byte === key[i]);
}

/** The request body for a subscription, or null when the browser left out a key. */
export function subscriptionBody(json: PushSubscriptionJSON): SavePushSubscriptionRequest | null {
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) return null;
  return { endpoint: json.endpoint, expirationTime: json.expirationTime ?? null, keys: { p256dh, auth } };
}

/** How long to wait for a worker that is still installing (a first visit) before calling push unavailable. */
const WORKER_WAIT_MS = 4000;

/**
 * The app's service worker registration, once it has an active worker; null
 * when there is none (`vite dev` has no worker). Never waits on
 * `navigator.serviceWorker.ready` alone: with nothing registered it never settles.
 */
export async function pushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration(appBase());
  if (existing?.active) return existing;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), WORKER_WAIT_MS));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

/**
 * This browser's subscription for `publicKey`: the existing one when it was
 * made with that key, otherwise a new one (dropping one made with an old key).
 */
export async function subscribeWith(registration: ServiceWorkerRegistration, publicKey: string): Promise<PushSubscription> {
  const key = base64UrlToBytes(publicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing !== null) {
    if (sameKey(existing.options.applicationServerKey, key)) return existing;
    await existing.unsubscribe();
  }
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

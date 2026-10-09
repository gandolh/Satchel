/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { clickPath, isShowingConversation, notificationFor, parsePushPayload, windowForClick } from "./push/notify";

/*
 * Satchel's service worker (vite-plugin-pwa, injectManifest; brief 14).
 *
 * The first half is what the generated worker did before push: precache the
 * app shell, answer navigations with index.html, and never touch the API or
 * Ward. The second half shows pushes and opens their chat on a click.
 *
 * workbox-precaching and workbox-routing come with vite-plugin-pwa (through
 * workbox-build), the same version the generated worker used.
 */

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | PrecacheEntry)[] };

/** `/satchel/` unless the build set SATCHEL_BASE; one trailing slash. */
const BASE = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

// --- The app shell ------------------------------------------------------------

// A new worker waits. main.tsx asks it to take over (workbox-window's
// messageSkipWaiting) once the page is hidden, so an update never reloads the
// app under somebody mid-message.
self.addEventListener("message", (event) => {
  if ((event.data as { type?: unknown } | null)?.type === "SKIP_WAITING") void self.skipWaiting();
});

// HTML, JS, CSS, icons and woff2 fonts, listed at build time.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Never answer for the API or Ward. Neither is under the worker's scope, and
// nothing caches at runtime, so their responses are never stored; the
// denylist keeps it so if the scope ever widens.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL(`${BASE}index.html`), {
    denylist: [/^\/satchel-api(\/|$)/, /^\/ward(-api)?(\/|$)/],
  }),
);

// --- Push -----------------------------------------------------------------------

function windows() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true });
}

function readJson(data: PushMessageData | null): unknown {
  try {
    return data?.json() as unknown;
  } catch {
    return null;
  }
}

async function showPush(data: PushMessageData | null): Promise<void> {
  const payload = parsePushPayload(readJson(data));
  if (payload === null) {
    // Not one of ours (a DevTools test push, say). Still show something: a
    // push that shows nothing counts against the site in Chrome and Safari.
    await self.registration.showNotification("Satchel", { body: "New message", tag: "satchel", data: { path: BASE } });
    return;
  }
  // Someone already looking at this chat sees the message arrive live.
  if (isShowingConversation(await windows(), BASE, payload.conversationId)) return;
  const { title, options } = notificationFor(payload, BASE);
  await self.registration.showNotification(title, options);
}

/** Focus a Satchel window and take it to `path`, or open one there. */
async function openChat(path: string): Promise<void> {
  const url = new URL(path, self.location.origin).href;
  const target = windowForClick(await windows(), BASE, path);
  if (target !== null) {
    try {
      const focused = await target.focus();
      if (new URL(focused.url).pathname !== path) await focused.navigate(url);
      return;
    } catch {
      // A window this worker doesn't control can't be navigated from here.
    }
  }
  await self.clients.openWindow(url);
}

self.addEventListener("push", (event) => {
  event.waitUntil(showPush(event.data));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openChat(clickPath(event.notification.data, BASE)));
});

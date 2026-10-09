import { useMemo, useSyncExternalStore } from "react";
import { appBase } from "./base";

/**
 * The router, without a library: four routes on the History API, under the
 * app's base (`import.meta.env.BASE_URL`, `/satchel/` by default).
 *
 *   /satchel/            chats
 *   /satchel/c/:id       thread
 *   /satchel/settings    settings
 *   /satchel/new         start a chat
 *
 * Anything else is chats; the shell rewrites the address to `/satchel/`.
 */

export type Route = { name: "chats" } | { name: "thread"; id: string } | { name: "settings" } | { name: "new" };

export const CHATS: Route = { name: "chats" };
export const SETTINGS: Route = { name: "settings" };
export const NEW_CHAT: Route = { name: "new" };

export function threadRoute(id: string): Route {
  return { name: "thread", id };
}

/** Which route a pathname is. Unknown paths, and paths outside the base, are chats. */
export function matchRoute(pathname: string, base: string = appBase()): Route {
  const root = base.replace(/\/+$/, "");
  if (pathname !== root && !pathname.startsWith(`${root}/`)) return CHATS;
  const rest = pathname.slice(root.length).replace(/^\/+/, "").replace(/\/$/, "");
  if (rest === "settings") return SETTINGS;
  if (rest === "new") return NEW_CHAT;
  const thread = /^c\/([^/]+)$/.exec(rest);
  if (thread?.[1]) {
    try {
      const id = decodeURIComponent(thread[1]);
      if (id.trim() !== "") return threadRoute(id);
    } catch {
      // A malformed escape is not a conversation id.
    }
  }
  return CHATS;
}

/** The canonical path of a route. */
export function pathFor(route: Route, base: string = appBase()): string {
  switch (route.name) {
    case "chats":
      return base;
    case "settings":
      return `${base}settings`;
    case "new":
      return `${base}new`;
    case "thread":
      return `${base}c/${encodeURIComponent(route.id)}`;
  }
}

export function sameRoute(a: Route, b: Route): boolean {
  return a.name === b.name && (a.name !== "thread" || (b.name === "thread" && a.id === b.id));
}

// --- Navigation -----------------------------------------------------------------

const NAVIGATE_EVENT = "satchel:navigate";

/** How many in-app entries sit behind this one, so Back can stay inside the app. */
interface HistoryState {
  satchelDepth?: number;
}

function depth(): number {
  const state = window.history.state as HistoryState | null;
  return typeof state?.satchelDepth === "number" ? state.satchelDepth : 0;
}

/** Go to a route. `replace` swaps the current history entry instead of adding one. */
export function navigate(to: Route, options: { replace?: boolean } = {}): void {
  const path = pathFor(to);
  if (options.replace) {
    window.history.replaceState({ satchelDepth: depth() } satisfies HistoryState, "", path);
  } else {
    if (window.location.pathname === path) return;
    window.history.pushState({ satchelDepth: depth() + 1 } satisfies HistoryState, "", path);
  }
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

/**
 * The back arrow: the browser's Back when the previous entry is in the app,
 * otherwise (a deep link, a fresh tab) replace this entry with the chat list.
 */
export function goBack(): void {
  if (depth() > 0) window.history.back();
  else navigate(CHATS, { replace: true });
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

function currentPathname(): string {
  return window.location.pathname;
}

/** The current route; re-renders on navigation and on Back/Forward. */
export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, currentPathname);
  return useMemo(() => matchRoute(pathname), [pathname]);
}

/** The raw pathname, for checking whether the address is the route's canonical one. */
export function usePathname(): string {
  return useSyncExternalStore(subscribe, currentPathname);
}

import type { PushPayload } from "@satchel/shared";

/**
 * The service worker's decisions, as pure functions so they can be tested
 * without a worker (brief 14). `sw.ts` is the thin part that calls them.
 * Nothing here imports React, the router or zod: all of it ends up in sw.js.
 */

/** What a window looks like to the worker: `WindowClient`'s `url` and `focused`. */
export interface WindowLike {
  url: string;
  focused: boolean;
}

/** A thread's path, the same as the router's `pathFor(threadRoute(id))`. */
export function conversationPath(base: string, conversationId: string): string {
  return `${base}c/${encodeURIComponent(conversationId)}`;
}

/** The payload the server pushed, or null for anything else. Hand-checked: the worker carries no zod. */
export function parsePushPayload(data: unknown): PushPayload | null {
  if (typeof data !== "object" || data === null) return null;
  const { conversationId, title, body } = data as Record<string, unknown>;
  if (typeof conversationId !== "string" || conversationId === "") return null;
  if (typeof title !== "string" || typeof body !== "string") return null;
  return { conversationId, title, body };
}

// Not URL.canParse: Safari only has it from 17, and iOS 16.4 to 16.7 has web push.
function pathnameOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/** Whether a focused window is already showing this conversation, so a notification would only repeat it. */
export function isShowingConversation(windows: readonly WindowLike[], base: string, conversationId: string): boolean {
  const path = conversationPath(base, conversationId);
  return windows.some((window) => window.focused && pathnameOf(window.url) === path);
}

/** `NotificationOptions` plus `renotify`, which Chrome honours and the DOM typings leave out. */
export type SatchelNotificationOptions = NotificationOptions & { renotify?: boolean; data: NotificationData };

export interface NotificationData {
  conversationId: string;
  /** Where a click goes: the thread's path under the app. */
  path: string;
}

/**
 * The notification for a push. `tag` is the conversation, so a chat has one
 * notification that the newest message replaces; `renotify` makes that
 * replacement buzz again, as a new message should.
 */
export function notificationFor(payload: PushPayload, base: string): { title: string; options: SatchelNotificationOptions } {
  return {
    title: payload.title,
    options: {
      body: payload.body,
      tag: payload.conversationId,
      renotify: true,
      icon: `${base}pwa-192x192.png`,
      data: { conversationId: payload.conversationId, path: conversationPath(base, payload.conversationId) },
    },
  };
}

/** A click's target path from the notification's data; the app's root when the data is missing. */
export function clickPath(data: unknown, base: string): string {
  const path = (data as Partial<NotificationData> | null)?.path;
  return typeof path === "string" && path.startsWith(base) ? path : base;
}

/**
 * Which open window a click should reuse: one already on the target, else a
 * focused one, else any window under the app. Null means open a new one.
 */
export function windowForClick<T extends WindowLike>(windows: readonly T[], base: string, path: string): T | null {
  const inApp = windows.filter((window) => pathnameOf(window.url)?.startsWith(base));
  return (
    inApp.find((window) => pathnameOf(window.url) === path) ??
    inApp.find((window) => window.focused) ??
    inApp[0] ??
    null
  );
}

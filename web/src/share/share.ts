import { appBase } from "../base";
import { matchRoute, pathFor, SHARE } from "../router";

/*
 * Sharing into Satchel from Android's share sheet (brief 17).
 *
 * The manifest's `share_target` is a GET to `<base>share?title=&text=&url=`,
 * so a share is an ordinary navigation and the service worker needs no
 * handler. Safari ignores `share_target`; nothing else in the app leads to
 * the share route, so the iPhone loses nothing.
 *
 * Two hand-offs, each used once:
 *
 * 1. At start-up (`main.tsx`), `captureShare()` turns the query into one
 *    message, keeps it in this tab's sessionStorage and drops the query from
 *    the address. sessionStorage outlives "Sign in with Ward", which leaves
 *    the page for Ward and comes back to the bare `/share` path; a password
 *    sign-in never leaves the page. The text never goes to the server or
 *    into the sign-in's `returnTo`.
 * 2. Once signed in, the share screen takes it (`takeSharedText`) and offers
 *    it to the Ideas inbox as a draft (`offerDraft`), held in memory only, and
 *    replaces the address with the thread's. The thread puts it in the
 *    composer, unsent, and clears it, so a reload never pastes it again.
 */

/** What the share sheet hands over: the manifest's `share_target` params. */
export interface SharedFields {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}

/**
 * One message from a share: the text (or the title, only when there is no
 * text), then the URL on its own line unless the text already holds it.
 * Chrome on Android often puts a page's link in `text` and leaves `url`
 * empty; the containment check keeps it from appearing twice. Null when
 * nothing was shared. Nothing is cut: the composer shows an over-long text
 * as over the limit, as it does a typed one.
 */
export function shareMessage({ title, text, url }: SharedFields): string | null {
  const body = clean(text) || clean(title);
  const link = clean(url);
  const parts = body === "" ? [] : [body];
  if (link !== "" && !body.includes(link)) parts.push(link);
  return parts.length === 0 ? null : parts.join("\n");
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** The share params out of a query string. */
export function sharedFields(search: string): SharedFields {
  const params = new URLSearchParams(search);
  return { title: params.get("title"), text: params.get("text"), url: params.get("url") };
}

// --- 1. Kept through sign-in -----------------------------------------------------

/** sessionStorage's key for a share that hasn't reached a composer yet. */
export const SHARE_STASH_KEY = "satchel:shared-text";

type StashStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Where a share waits for sign-in: this tab's sessionStorage, and memory as
 * well, so a password sign-in still works where storage throws (a private
 * window, blocked site data).
 */
export function createShareStash(storage: StashStorage | null) {
  let memory: string | null = null;
  return {
    put(text: string): void {
      memory = text;
      try {
        storage?.setItem(SHARE_STASH_KEY, text);
      } catch {
        // Memory alone: enough unless the page reloads before sign-in.
      }
    },
    /** The waiting share, removed as it is read. */
    take(): string | null {
      let text = memory;
      memory = null;
      try {
        text ??= storage?.getItem(SHARE_STASH_KEY) ?? null;
        storage?.removeItem(SHARE_STASH_KEY);
      } catch {
        // Nothing more to read or clear.
      }
      return text;
    },
  };
}

function sessionStore(): StashStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const stash = createShareStash(sessionStore());

export interface ShareCapturePlace {
  location: Pick<Location, "pathname" | "search" | "hash">;
  history: Pick<History, "state" | "replaceState">;
}

/**
 * At start-up: on the share route, keep what was shared and drop the query
 * from the address. A share route with nothing in it (a reload while still
 * signed out) leaves an earlier share waiting.
 */
export function captureShare(
  place: ShareCapturePlace = window,
  base: string = appBase(),
  into: { put(text: string): void } = stash,
): void {
  const { location, history } = place;
  if (matchRoute(location.pathname, base).name !== "share") return;
  const text = shareMessage(sharedFields(location.search));
  if (text !== null) into.put(text);
  if (location.search !== "" || location.hash !== "") history.replaceState(history.state, "", pathFor(SHARE, base));
}

/** The share waiting for this signed-in tab, if any; gone once read. */
export function takeSharedText(): string | null {
  return stash.take();
}

// --- 2. Handed to one composer ----------------------------------------------------

/** A draft for the composer: for one conversation, or (`null`) for whichever chat opens next. */
let draft: { conversationId: string | null; text: string } | null = null;

/**
 * Offer the shared text to a conversation's composer. The owner's goes to the
 * Ideas inbox; a friend has no inbox, so theirs waits for the first chat they
 * open from the list.
 */
export function offerDraft(conversationId: string | null, text: string): void {
  draft = { conversationId, text };
}

/** The draft waiting for this conversation, without taking it (safe in a state initializer). */
export function draftFor(conversationId: string): string | undefined {
  if (draft === null) return undefined;
  return draft.conversationId === null || draft.conversationId === conversationId ? draft.text : undefined;
}

/** Drop the draft once a composer has it, so it shows once. */
export function clearDraft(conversationId: string): void {
  if (draftFor(conversationId) !== undefined) draft = null;
}

import type { ConversationSummary, LiveEvent } from "@satchel/shared";
import { useEffect, useSyncExternalStore } from "react";
import { listConversations, NoAccess, SignedOut } from "../api";
import { useMe } from "../auth/session";
import { live, useLiveConnected, useLiveConnection } from "../live";
import { applyLiveEvent, sortConversations } from "./conversation";

/**
 * The chat list's data, kept outside React so it survives the list unmounting
 * (on a phone the list goes away while a thread is open) and so other screens
 * can read a conversation's summary before their own request answers.
 *
 * Kept current by live events while the socket is up (brief 12), refetched on
 * every (re)connect, and polled by the chat list only while the socket is down.
 */

/** design.md: the list polls every 10 seconds while visible, now only while live updates are down. */
export const CHAT_LIST_POLL_MS = 10_000;

export interface ConversationsSnapshot {
  /** Null until the first answer. Sorted: the Ideas inbox first, then by latest message. */
  conversations: ConversationSummary[] | null;
  /** The last refresh's failure, cleared by the next success. */
  error: Error | null;
}

let snapshot: ConversationsSnapshot = { conversations: null, error: null };
let inFlight: Promise<void> | undefined;
/** Whose unread counts the list holds: set by `useLiveChats`, read when applying events. */
let viewer: string | null = null;
const listeners = new Set<() => void>();

function publish(next: ConversationsSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** One `GET /api/conversations`, shared by concurrent callers. Rejects when it failed (after showing why). */
function load(): Promise<void> {
  inFlight ??= (async () => {
    try {
      const { conversations } = await listConversations();
      publish({ conversations: sortConversations(conversations), error: null });
    } catch (error) {
      // The auth gate takes over for these; there is no list to show.
      if (!(error instanceof SignedOut || error instanceof NoAccess)) {
        publish({ ...snapshot, error: error instanceof Error ? error : new Error(String(error)) });
      }
      throw error;
    }
  })().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

/** Fetch the list now. Concurrent calls share one request. Never throws. */
export function refreshConversations(): Promise<void> {
  return load().catch(() => undefined);
}

/** The catch-up on every (re)connect. Fails, so the socket retries, unless the session is over. */
async function catchUpConversations(): Promise<void> {
  try {
    await load();
  } catch (error) {
    if (error instanceof SignedOut || error instanceof NoAccess) return;
    throw error;
  }
}

/** Apply one live event to the list. Before the list's first answer there is nothing to apply it to. */
export function applyToConversations(event: LiveEvent): void {
  const conversations = snapshot.conversations;
  if (conversations === null || viewer === null) return;
  const update = applyLiveEvent(conversations, event, viewer);
  if (update.conversations !== conversations) publish({ ...snapshot, conversations: update.conversations });
  if (update.stale) void refreshConversations();
}

live.onConnect(catchUpConversations);
live.onEvent(applyToConversations);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ConversationsSnapshot {
  return snapshot;
}

/** The latest list and error. Doesn't fetch by itself: the chat list polls while live updates are down. */
export function useConversations(): ConversationsSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** One conversation from the last list, if it was in it. */
export function useConversationSummary(id: string): ConversationSummary | undefined {
  return useConversations().conversations?.find((conversation) => conversation.id === id);
}

/**
 * For the screens inside the auth gate: opens the tab's live socket (once; it
 * stays open), tells the list whose unread counts it keeps, and returns
 * whether the socket is live. Poll while it's false.
 */
export function useLiveChats(): boolean {
  const { subject } = useMe();
  useEffect(() => {
    viewer = subject;
  }, [subject]);
  useLiveConnection();
  return useLiveConnected();
}

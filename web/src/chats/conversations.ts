import type { ConversationSummary } from "@satchel/shared";
import { useSyncExternalStore } from "react";
import { listConversations, NoAccess, SignedOut } from "../api";
import { sortConversations } from "./conversation";

/**
 * The chat list's data, kept outside React so it survives the list unmounting
 * (on a phone the list goes away while a thread is open) and so other screens
 * can read a conversation's summary before their own request answers.
 */

/** design.md: the list polls every 10 seconds while visible. */
export const CHAT_LIST_POLL_MS = 10_000;

export interface ConversationsSnapshot {
  /** Null until the first answer. Sorted: the Ideas inbox first, then by latest message. */
  conversations: ConversationSummary[] | null;
  /** The last refresh's failure, cleared by the next success. */
  error: Error | null;
}

let snapshot: ConversationsSnapshot = { conversations: null, error: null };
let inFlight: Promise<void> | undefined;
const listeners = new Set<() => void>();

function publish(next: ConversationsSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

async function load(): Promise<void> {
  try {
    const { conversations } = await listConversations();
    publish({ conversations: sortConversations(conversations), error: null });
  } catch (error) {
    // The auth gate takes over for these; there is no list to show.
    if (error instanceof SignedOut || error instanceof NoAccess) return;
    publish({ ...snapshot, error: error instanceof Error ? error : new Error(String(error)) });
  }
}

/** Fetch the list now. Concurrent calls share one request. Never throws. */
export function refreshConversations(): Promise<void> {
  inFlight ??= load().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ConversationsSnapshot {
  return snapshot;
}

/** The latest list and error. Doesn't fetch by itself: the chat list polls. */
export function useConversations(): ConversationsSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** One conversation from the last list, if it was in it. */
export function useConversationSummary(id: string): ConversationSummary | undefined {
  return useConversations().conversations?.find((conversation) => conversation.id === id);
}

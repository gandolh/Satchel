import { MAX_TEXT_LENGTH, type ConversationSummary, type Message } from "@satchel/shared";
import { ApiError, NetworkError } from "../errors";
import { withMarker, withNewerMarkers } from "../chats/conversation";
import { calendarDaysBetween } from "../chats/time";

/**
 * The thread's state and the pure rules around it, kept out of React so they
 * are unit-testable. Server messages and not-yet-stored ones (pending bubbles)
 * live side by side and meet again by client ID.
 */

// --- Sending ------------------------------------------------------------------

/** A bubble the server hasn't confirmed. In memory only: a reload drops it (decisions: no outbox). */
export interface PendingMessage {
  clientId: string;
  text: string;
  /** `sending`: in flight. `failed`: tap to retry. `rejected`: the server said no; no retry. */
  status: "sending" | "failed" | "rejected";
  /** The server's words, for `rejected`. */
  error?: string;
}

/** Text length as the server counts it: line endings normalised first. */
export function textLength(text: string): number {
  return text.replace(/\r\n/gu, "\n").length;
}

export function isBlank(text: string): boolean {
  return text.trim().length === 0;
}

export function canSend(text: string): boolean {
  return !isBlank(text) && textLength(text) <= MAX_TEXT_LENGTH;
}

/** The counter shows from here (design: 3800 of 4000). */
export const COUNTER_FROM = 3800;

/**
 * Whether the same client ID may be sent again: the request never got an
 * answer (network, 10 second timeout) or the server failed (5xx). A 400 or 409
 * would only fail again.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof DOMException && error.name === "TimeoutError") return true;
  return error instanceof ApiError && error.status >= 500;
}

// --- State --------------------------------------------------------------------

export interface ThreadState {
  /** False until the first load answers. */
  loaded: boolean;
  /** The latest summary from a response: members and their seen markers. */
  conversation: ConversationSummary | null;
  /** Stored messages, ascending by seq, no duplicates. */
  messages: Message[];
  /**
   * Where the next fetch starts (`after=`): the highest seq a fetch (poll or
   * catch-up) returned or a live event delivered once loaded. Send answers
   * don't move it, or a friend's message that landed just before mine would
   * be skipped. Live events may: the socket delivers in seq order, so every
   * earlier message already arrived over it or in the catch-up before it.
   */
  cursor: number;
  pending: PendingMessage[];
}

export const initialThreadState: ThreadState = {
  loaded: false,
  conversation: null,
  messages: [],
  cursor: 0,
  pending: [],
};

export type ThreadAction =
  | { type: "loaded"; conversation: ConversationSummary; messages: Message[] }
  /** A live `message` event for this conversation. */
  | { type: "received"; message: Message }
  /** A live `seen` event for this conversation. */
  | { type: "seenMoved"; member: string; seenUpTo: number; seenAt: string }
  | { type: "sendStarted"; clientId: string; text: string }
  | { type: "sendSucceeded"; message: Message }
  | { type: "sendFailed"; clientId: string; retryable: boolean; error: string }
  | { type: "retryStarted"; clientId: string };

/** Add messages to an ascending list, ignoring seqs it already has. */
export function mergeMessages(existing: readonly Message[], incoming: readonly Message[]): Message[] {
  const bySeq = new Map<number, Message>();
  for (const message of existing) bySeq.set(message.seq, message);
  for (const message of incoming) if (!bySeq.has(message.seq)) bySeq.set(message.seq, message);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/** Drop pending bubbles whose client ID is now a stored message. */
export function reconcilePending(
  pending: readonly PendingMessage[],
  messages: readonly Message[],
): PendingMessage[] {
  if (pending.length === 0) return [];
  const stored = new Set(messages.map((message) => message.clientId));
  return pending.filter((bubble) => !stored.has(bubble.clientId));
}

function setStatus(
  pending: readonly PendingMessage[],
  clientId: string,
  change: Pick<PendingMessage, "status"> & { error?: string },
): PendingMessage[] {
  return pending.map((bubble) => {
    if (bubble.clientId !== clientId) return bubble;
    const { error: _old, ...rest } = bubble;
    return { ...rest, ...change };
  });
}

export function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case "loaded": {
      const messages = mergeMessages(state.messages, action.messages);
      const last = action.messages.at(-1);
      return {
        ...state,
        loaded: true,
        // An answer can be older than a live event already applied; markers only move forward.
        conversation: state.conversation ? withNewerMarkers(action.conversation, state.conversation) : action.conversation,
        messages,
        cursor: last ? Math.max(state.cursor, last.seq) : state.cursor,
        pending: reconcilePending(state.pending, messages),
      };
    }
    case "received": {
      const { message } = action;
      if (state.messages.some((shown) => shown.seq === message.seq)) return state;
      const messages = mergeMessages(state.messages, [message]);
      const { conversation } = state;
      return {
        ...state,
        messages,
        // Before the first load answers, the load (not this event) decides where fetching resumes.
        cursor: state.loaded ? Math.max(state.cursor, message.seq) : state.cursor,
        pending: reconcilePending(state.pending, messages),
        conversation: conversation && {
          ...conversation,
          // Sending marks seen: the sender's marker is at their message now.
          members: withMarker(conversation.members, message.sender, message.seq, message.sentAt),
          lastMessage:
            conversation.lastMessage && conversation.lastMessage.seq > message.seq ? conversation.lastMessage : message,
        },
      };
    }
    case "seenMoved": {
      const { conversation } = state;
      if (!conversation) return state;
      const members = withMarker(conversation.members, action.member, action.seenUpTo, action.seenAt);
      return members === conversation.members ? state : { ...state, conversation: { ...conversation, members } };
    }
    case "sendStarted":
      if (state.pending.some((bubble) => bubble.clientId === action.clientId)) return state;
      return {
        ...state,
        pending: [...state.pending, { clientId: action.clientId, text: action.text, status: "sending" }],
      };
    case "sendSucceeded": {
      const messages = mergeMessages(state.messages, [action.message]);
      return { ...state, messages, pending: reconcilePending(state.pending, messages) };
    }
    case "sendFailed":
      return {
        ...state,
        pending: setStatus(state.pending, action.clientId, {
          status: action.retryable ? "failed" : "rejected",
          ...(action.retryable ? {} : { error: action.error }),
        }),
      };
    case "retryStarted":
      return { ...state, pending: setStatus(state.pending, action.clientId, { status: "sending" }) };
  }
}

// --- Day separators and the timeline -----------------------------------------

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const dayMonthYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "Today", "Yesterday", then "7 Oct" (with the year when it isn't this one), in local time. */
export function dayLabel(date: Date, now: Date): string {
  const days = calendarDaysBetween(date, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return (date.getFullYear() === now.getFullYear() ? dayMonth : dayMonthYear).format(date);
}

export type TimelineItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; key: string; message: Message }
  | { kind: "pending"; key: string; pending: PendingMessage };

/**
 * Messages then pending bubbles, with a day separator wherever the local
 * calendar day changes. Pending bubbles count as `now`. Bubbles are keyed by
 * client ID so a pending one becomes its stored message without remounting.
 */
export function buildTimeline(
  messages: readonly Message[],
  pending: readonly PendingMessage[],
  now: Date,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  let previous: Date | null = null;
  const separate = (date: Date) => {
    if (previous === null || calendarDaysBetween(previous, date) !== 0) {
      items.push({ kind: "day", key: `day-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`, label: dayLabel(date, now) });
    }
    previous = date;
  };
  for (const message of messages) {
    separate(new Date(message.sentAt));
    items.push({ kind: "message", key: message.clientId, message });
  }
  for (const bubble of pending) {
    separate(now);
    items.push({ kind: "pending", key: bubble.clientId, pending: bubble });
  }
  return items;
}

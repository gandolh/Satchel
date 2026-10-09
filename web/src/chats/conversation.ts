import {
  CLAUDE_DISPLAY_NAME,
  tickState,
  type ConversationSummary,
  type LiveEvent,
  type Member,
  type TickState,
} from "@satchel/shared";

/**
 * How a conversation is named and previewed. The list and the thread header
 * both read these, so a chat is called the same thing everywhere.
 */

/** The inbox's subtitle, everywhere it has one. */
export const INBOX_SUBTITLE = "Ideas inbox";

function others(conversation: ConversationSummary, me: string): Member[] {
  return conversation.members.filter((member) => member.id !== me);
}

/** "Claude" for the Ideas inbox, the title if set, else the other member (direct) or members (group). */
export function conversationTitle(conversation: ConversationSummary, me: string): string {
  if (conversation.kind === "inbox") return CLAUDE_DISPLAY_NAME;
  if (conversation.title) return conversation.title;
  const names = others(conversation, me).map((member) => member.displayName);
  if (conversation.kind === "direct") return names[0] ?? "Chat";
  return names.join(", ") || "Group";
}

/** The thread header's one line: "Ideas inbox", a group's members ("You, Maria, Andrei"), or nothing. */
export function conversationSubtitle(conversation: ConversationSummary, me: string): string {
  if (conversation.kind === "inbox") return INBOX_SUBTITLE;
  if (conversation.kind === "group") {
    return ["You", ...others(conversation, me).map((member) => member.displayName)].join(", ");
  }
  return "";
}

export interface MessagePreview {
  /** "You", a group member's name, or null (someone else in a direct chat or the inbox). */
  sender: string | null;
  /** On one line. */
  text: string;
  /** The tick when my message is last; null otherwise. */
  tick: TickState | null;
}

/** The list row's second line, from the last message. Null when there is none. */
export function lastMessagePreview(conversation: ConversationSummary, me: string): MessagePreview | null {
  const message = conversation.lastMessage;
  if (message === null) return null;
  const text = message.text.replace(/\s+/gu, " ").trim();
  if (message.sender === me) {
    return { sender: "You", text, tick: tickState(message, conversation.members, me) };
  }
  const sender =
    conversation.kind === "group"
      ? (conversation.members.find((member) => member.id === message.sender)?.displayName ?? null)
      : null;
  return { sender, text, tick: null };
}

/** The Ideas inbox pinned first, then by latest message. Chats with no messages keep the server's order, last. */
export function sortConversations(conversations: readonly ConversationSummary[]): ConversationSummary[] {
  return [...conversations].sort((a, b) => {
    const aInbox = a.kind === "inbox";
    const bInbox = b.kind === "inbox";
    if (aInbox !== bInbox) return aInbox ? -1 : 1;
    return (b.lastMessage?.seq ?? 0) - (a.lastMessage?.seq ?? 0);
  });
}

// --- Seen markers and live events -----------------------------------------------

/**
 * `members` with `id`'s marker moved to `seenUpTo` at `seenAt`, forward only
 * like the server's. The same array when nothing moves.
 */
export function withMarker(members: readonly Member[], id: string, seenUpTo: number, seenAt: string): Member[] {
  const index = members.findIndex((member) => member.id === id);
  const current = members[index];
  if (current === undefined || seenUpTo <= current.seenUpTo) return members as Member[];
  const next = [...members];
  next[index] = { ...current, seenUpTo, seenAt };
  return next;
}

/**
 * `base` with each member's marker at least as far as in `other`. Markers
 * only move forward, so of two answers about the same conversation the
 * higher marker is always the true one, whichever answer is older.
 */
export function withNewerMarkers(base: ConversationSummary, other: ConversationSummary): ConversationSummary {
  let members = base.members;
  for (const member of other.members) {
    if (member.seenAt !== null) members = withMarker(members, member.id, member.seenUpTo, member.seenAt);
  }
  return members === base.members ? base : { ...base, members };
}

export interface LiveListUpdate {
  /** The list after the event; the same array when the event changed nothing. */
  conversations: ConversationSummary[];
  /** The event can't be applied from what the list holds: refetch it. */
  stale: boolean;
}

/**
 * The chat list after a live event, as `me` sees it.
 *
 * - `message`: the conversation's last message, and the sender's marker
 *   (sending marks seen). My unread count goes up by one for someone else's
 *   message and to zero for mine. A message the list already covers changes
 *   nothing.
 * - `seen`: the member's marker, forward only. Mine reaching the last
 *   message clears my unread count; short of it, only a refetch knows.
 * - `conversation`: added, or replaced by the newer summary.
 *
 * A conversation the list doesn't have is `stale`.
 */
export function applyLiveEvent(
  conversations: ConversationSummary[],
  event: LiveEvent,
  me: string,
): LiveListUpdate {
  if (event.type === "conversation") {
    const others = conversations.filter((conversation) => conversation.id !== event.conversation.id);
    return { conversations: sortConversations([...others, event.conversation]), stale: false };
  }

  const index = conversations.findIndex((conversation) => conversation.id === event.conversationId);
  const current = conversations[index];
  if (current === undefined) return { conversations, stale: true };

  let next: ConversationSummary;
  let stale = false;
  if (event.type === "message") {
    const { message } = event;
    if (current.lastMessage !== null && message.seq <= current.lastMessage.seq) return { conversations, stale: false };
    next = {
      ...current,
      lastMessage: message,
      members: withMarker(current.members, message.sender, message.seq, message.sentAt),
      unreadCount: message.sender === me ? 0 : current.unreadCount + 1,
    };
  } else {
    const members = withMarker(current.members, event.member, event.seenUpTo, event.seenAt);
    if (members === current.members) return { conversations, stale: false };
    next = { ...current, members };
    if (event.member === me) {
      if (current.lastMessage === null || event.seenUpTo >= current.lastMessage.seq) next.unreadCount = 0;
      else stale = true;
    }
  }

  const updated = [...conversations];
  updated[index] = next;
  return { conversations: event.type === "message" ? sortConversations(updated) : updated, stale };
}

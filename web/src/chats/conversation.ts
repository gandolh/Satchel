import {
  CLAUDE_DISPLAY_NAME,
  tickState,
  type ConversationSummary,
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

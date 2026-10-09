import {
  CLAUDE_MEMBER,
  PUSH_BODY_MAX_LENGTH,
  type ConversationSummary,
  type Message,
  type PushPayload,
} from "@satchel/shared";

/**
 * Who a stored message is pushed to: every member except its sender and
 * Claude. The Ideas inbox has nobody (its members are the owner, who sent it,
 * and Claude), and it is left out explicitly too: Claude never sends, and the
 * owner's own notes are never pushed back to them.
 */
export function pushRecipients(conversation: ConversationSummary, sender: string): string[] {
  if (conversation.kind === "inbox") return [];
  return conversation.members.map((member) => member.id).filter((id) => id !== sender && id !== CLAUDE_MEMBER);
}

/**
 * The notification for `message`: titled with the sender's name in a direct
 * chat and "Sender in Group title" in a group; the body is the text's first
 * `PUSH_BODY_MAX_LENGTH` characters, counted in code points so an emoji is
 * never cut in half.
 */
export function pushPayloadFor(conversation: ConversationSummary, message: Message): PushPayload {
  const sender = conversation.members.find((member) => member.id === message.sender)?.displayName ?? message.sender;
  const title = conversation.kind === "group" && conversation.title ? `${sender} in ${conversation.title}` : sender;
  const body = Array.from(message.text).slice(0, PUSH_BODY_MAX_LENGTH).join("");
  return { conversationId: conversation.id, title, body };
}

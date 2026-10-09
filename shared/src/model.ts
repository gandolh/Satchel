import { z } from "zod";
import { MAX_TEXT_LENGTH } from "./limits.js";

const timestamp = z.iso.datetime();

export const CONVERSATION_KINDS = ["inbox", "direct", "group"] as const;
export const conversationKindSchema = z.enum(CONVERSATION_KINDS);
export type ConversationKind = z.infer<typeof conversationKindSchema>;

export const memberSchema = z.object({
  /** A Ward subject, or `CLAUDE_MEMBER` in an Ideas inbox. */
  id: z.string().min(1),
  displayName: z.string(),
  seenUpTo: z.number().int().nonnegative(),
  /** When the seen marker last moved; null until it first does. */
  seenAt: timestamp.nullable(),
});
export type Member = z.infer<typeof memberSchema>;

export const messageSchema = z.object({
  seq: z.number().int().positive(),
  conversationId: z.string().min(1),
  sender: z.string().min(1),
  clientId: z.uuid(),
  // Plain string, not messageTextSchema: a stored message must stay readable
  // even if the rules for new text tighten later.
  text: z.string(),
  sentAt: timestamp,
});
export type Message = z.infer<typeof messageSchema>;

export const conversationSummarySchema = z.object({
  id: z.string().min(1),
  kind: conversationKindSchema,
  /**
   * A group's title. Null for the Ideas inbox, which the UI titles "Claude",
   * and for a direct conversation, which it titles by the other member's name.
   */
  title: z.string().nullable(),
  members: z.array(memberSchema),
  lastMessage: messageSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

/** Someone the caller can start a conversation with: an account that has signed in to Satchel. */
export const personSchema = z.object({
  /** A Ward subject. */
  subject: z.string().min(1),
  displayName: z.string(),
});
export type Person = z.infer<typeof personSchema>;

// Line endings are normalised before the checks, so a pasted "\r\n" counts as
// one character. The text is never trimmed: what was typed is what is stored.
export const messageTextSchema = z
  .string()
  .overwrite((text) => text.replace(/\r\n?/g, "\n"))
  .max(MAX_TEXT_LENGTH, `A message can be at most ${MAX_TEXT_LENGTH} characters.`)
  .regex(/\S/, "A message can't be empty or only spaces.");
export type MessageText = z.infer<typeof messageTextSchema>;

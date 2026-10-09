import { z } from "zod";
import { PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX } from "./limits.js";
import { conversationSummarySchema, messageSchema, messageTextSchema, personSchema } from "./model.js";

/**
 * The API contract: every route's request and response as zod schemas, plus
 * one route object per route in `routes`. The server validates with them and
 * the web app and the CLI parse with them, so the three cannot drift. Paths
 * are relative to the API base, which Caddy serves at `/satchel-api`.
 */

const timestamp = z.iso.datetime();
const id = z.string().min(1);
const seq = z.number().int().positive();
const seqOrZero = z.number().int().nonnegative();
const after = z.coerce.number<number>().int().nonnegative().default(0);
const limit = z.coerce
  .number<number>()
  .int()
  .min(1)
  .max(PAGE_LIMIT_MAX)
  .default(PAGE_LIMIT_DEFAULT);

// Normalised to a UTC `toISOString()` value so the server can compare it with
// `sentAt` as text. A bare date means midnight UTC.
const since = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .transform((value) => new Date(value).toISOString());

// --- Routes and errors --------------------------------------------------------

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** `ward`: a Ward session cookie with a Satchel grant. `claude`: a Claude token as a bearer token. */
export type RouteAuth = "none" | "ward" | "claude";

export interface Route {
  method: HttpMethod;
  path: string;
  auth: RouteAuth;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
}

export const ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "invalid_request",
  "client_id_conflict",
  "unavailable",
  "internal",
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/**
 * - `unauthorized`: no Ward session, or an unknown or revoked Claude token.
 * - `forbidden`: a valid Ward session without a Satchel grant, a write sent
 *   from another origin, or a friend on a route only the owner may use (the
 *   Claude token routes).
 * - `not_found`: also a conversation the caller isn't a member of, never
 *   `forbidden`, so its existence doesn't leak.
 * - `unavailable`: Ward is unreachable.
 * - `internal`: an unexpected server error; the message never carries details.
 */
export const ERROR_STATUS = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  client_id_conflict: 409,
  unavailable: 503,
  internal: 500,
} as const satisfies Record<ErrorCode, number>;

export const errorResponseSchema = z.object({
  error: z.object({ code: errorCodeSchema, message: z.string() }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export function apiError(code: ErrorCode, message: string): ErrorResponse {
  return { error: { code, message } };
}

// --- GET /api/health ------------------------------------------------------------

export const healthResponseSchema = z.object({ ok: z.literal(true) });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// --- GET /api/me ----------------------------------------------------------------

export const meResponseSchema = z.object({
  subject: id,
  displayName: z.string(),
  /** The owner's Ideas inbox. Null for a friend: only an account with the `admin` role on Satchel has one. */
  inboxId: id.nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

// --- GET /api/conversations -------------------------------------------------------

export const conversationsResponseSchema = z.object({
  conversations: z.array(conversationSummarySchema),
});
export type ConversationsResponse = z.infer<typeof conversationsResponseSchema>;

// --- GET /api/people ---------------------------------------------------------------

/** Every account except the caller, ordered by display name. */
export const peopleResponseSchema = z.object({ people: z.array(personSchema) });
export type PeopleResponse = z.infer<typeof peopleResponseSchema>;

// --- POST /api/conversations ----------------------------------------------------------

export const GROUP_TITLE_MAX_LENGTH = 80;
/** A group's other members, not counting the one who creates it. */
export const GROUP_MEMBERS_MIN = 2;
export const GROUP_MEMBERS_MAX = 20;

const requiredSubject = (message: string) => z.string({ error: message }).min(1, message);

export const createDirectRequestSchema = z.object({
  kind: z.literal("direct"),
  /** The other member's subject. Not the caller's own. */
  with: requiredSubject("Say who the chat is with."),
});

// The title is trimmed before the length checks; a title of only spaces is no title.
export const createGroupRequestSchema = z.object({
  kind: z.literal("group"),
  title: z
    .string({ error: "A group needs a title." })
    .trim()
    .min(1, "A group needs a title.")
    .max(GROUP_TITLE_MAX_LENGTH, `A group title can be at most ${GROUP_TITLE_MAX_LENGTH} characters.`),
  /** The other members' subjects: no duplicates, and not the caller, who is added anyway. */
  members: z
    .array(requiredSubject("Each member must be a subject."), { error: "A group needs a list of members." })
    .min(GROUP_MEMBERS_MIN, `A group needs at least ${GROUP_MEMBERS_MIN} other members.`)
    .max(GROUP_MEMBERS_MAX, `A group can have at most ${GROUP_MEMBERS_MAX} other members.`)
    .refine((members) => new Set(members).size === members.length, "Each member can be listed only once."),
});

/**
 * The server also answers 400 when `with` or a member is the caller, or is
 * not an account that has signed in to Satchel. Membership is fixed once the
 * conversation exists.
 */
export const createConversationRequestSchema = z.discriminatedUnion(
  "kind",
  [createDirectRequestSchema, createGroupRequestSchema],
  { error: 'kind must be "direct" or "group".' },
);
export type CreateConversationRequest = z.infer<typeof createConversationRequestSchema>;

/**
 * Direct: 201 when created; 200 when the two already had one, which is
 * returned instead of a second. Group: always 201, a new conversation.
 */
export const createConversationResponseSchema = z.object({ conversation: conversationSummarySchema });
export type CreateConversationResponse = z.infer<typeof createConversationResponseSchema>;

// --- GET /api/conversations/:id/messages ------------------------------------------

export const conversationParamsSchema = z.object({ id });
export type ConversationParams = z.infer<typeof conversationParamsSchema>;

/** Messages with seq above `after`, ascending, at most `limit`. */
export const messagesQuerySchema = z.object({ after, limit });
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;

export const messagesResponseSchema = z.object({
  conversation: conversationSummarySchema,
  messages: z.array(messageSchema),
  latestSeq: seqOrZero,
});
export type MessagesResponse = z.infer<typeof messagesResponseSchema>;

// --- POST /api/conversations/:id/messages -----------------------------------------

export const sendMessageRequestSchema = z.object({
  clientId: z.uuid(),
  text: messageTextSchema,
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

/** 201 when stored; 200 when the client ID was already stored with the same text in the same conversation. */
export const sendMessageResponseSchema = z.object({ message: messageSchema });
export type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>;

// --- POST /api/conversations/:id/seen and POST /claude/seen -----------------------

export const seenRequestSchema = z.object({ upTo: seqOrZero });
export type SeenRequest = z.infer<typeof seenRequestSchema>;

export const seenResponseSchema = z.object({ seenUpTo: seqOrZero });
export type SeenResponse = z.infer<typeof seenResponseSchema>;

// --- Claude tokens ------------------------------------------------------------------
// Strict objects where a response must never carry the token or its hash, so a
// handler that leaks one fails validation instead of having it stripped quietly.

export const claudeTokenSummarySchema = z.strictObject({
  id,
  createdAt: timestamp,
  lastUsedAt: timestamp.nullable(),
  revokedAt: timestamp.nullable(),
});
export type ClaudeTokenSummary = z.infer<typeof claudeTokenSummarySchema>;

export const claudeTokensResponseSchema = z.strictObject({
  tokens: z.array(claudeTokenSummarySchema),
});
export type ClaudeTokensResponse = z.infer<typeof claudeTokensResponseSchema>;

/** The only response that ever carries a Claude token. */
export const createClaudeTokenResponseSchema = z.object({
  id,
  token: z.string().regex(/^stl_[A-Za-z0-9_-]+$/),
  createdAt: timestamp,
});
export type CreateClaudeTokenResponse = z.infer<typeof createClaudeTokenResponseSchema>;

export const claudeTokenParamsSchema = z.object({ id });
export type ClaudeTokenParams = z.infer<typeof claudeTokenParamsSchema>;

export const revokeClaudeTokenResponseSchema = z.object({ id, revokedAt: timestamp });
export type RevokeClaudeTokenResponse = z.infer<typeof revokeClaudeTokenResponseSchema>;

// --- Claude's view of the Ideas inbox ---------------------------------------------
// Strict objects: Claude never gets `sender` or `clientId`, and a handler that
// passes a whole message row through must fail validation.

export const claudeUnreadMessageSchema = z.strictObject({
  seq,
  sentAt: timestamp,
  text: z.string(),
});
export type ClaudeUnreadMessage = z.infer<typeof claudeUnreadMessageSchema>;

export const claudeUnreadResponseSchema = z.strictObject({
  seenUpTo: seqOrZero,
  messages: z.array(claudeUnreadMessageSchema),
});
export type ClaudeUnreadResponse = z.infer<typeof claudeUnreadResponseSchema>;

export const claudeMessagesQuerySchema = z.object({
  after,
  since: since.optional(),
  limit,
});
export type ClaudeMessagesQuery = z.infer<typeof claudeMessagesQuerySchema>;

export const claudeHistoryMessageSchema = z.strictObject({
  seq,
  sentAt: timestamp,
  text: z.string(),
  seen: z.boolean(),
});
export type ClaudeHistoryMessage = z.infer<typeof claudeHistoryMessageSchema>;

export const claudeMessagesResponseSchema = z.strictObject({
  messages: z.array(claudeHistoryMessageSchema),
});
export type ClaudeMessagesResponse = z.infer<typeof claudeMessagesResponseSchema>;

// --- The routes ---------------------------------------------------------------------

export const routes = {
  health: {
    method: "GET",
    path: "/api/health",
    auth: "none",
    response: healthResponseSchema,
  },
  me: {
    method: "GET",
    path: "/api/me",
    auth: "ward",
    response: meResponseSchema,
  },
  listConversations: {
    method: "GET",
    path: "/api/conversations",
    auth: "ward",
    response: conversationsResponseSchema,
  },
  createConversation: {
    method: "POST",
    path: "/api/conversations",
    auth: "ward",
    body: createConversationRequestSchema,
    response: createConversationResponseSchema,
  },
  listPeople: {
    method: "GET",
    path: "/api/people",
    auth: "ward",
    response: peopleResponseSchema,
  },
  listMessages: {
    method: "GET",
    path: "/api/conversations/:id/messages",
    auth: "ward",
    params: conversationParamsSchema,
    query: messagesQuerySchema,
    response: messagesResponseSchema,
  },
  sendMessage: {
    method: "POST",
    path: "/api/conversations/:id/messages",
    auth: "ward",
    params: conversationParamsSchema,
    body: sendMessageRequestSchema,
    response: sendMessageResponseSchema,
  },
  markSeen: {
    method: "POST",
    path: "/api/conversations/:id/seen",
    auth: "ward",
    params: conversationParamsSchema,
    body: seenRequestSchema,
    response: seenResponseSchema,
  },
  listClaudeTokens: {
    method: "GET",
    path: "/api/claude-tokens",
    auth: "ward",
    response: claudeTokensResponseSchema,
  },
  createClaudeToken: {
    method: "POST",
    path: "/api/claude-tokens",
    auth: "ward",
    response: createClaudeTokenResponseSchema,
  },
  revokeClaudeToken: {
    method: "POST",
    path: "/api/claude-tokens/:id/revoke",
    auth: "ward",
    params: claudeTokenParamsSchema,
    response: revokeClaudeTokenResponseSchema,
  },
  claudeUnread: {
    method: "GET",
    path: "/claude/unread",
    auth: "claude",
    response: claudeUnreadResponseSchema,
  },
  claudeSeen: {
    method: "POST",
    path: "/claude/seen",
    auth: "claude",
    body: seenRequestSchema,
    response: seenResponseSchema,
  },
  claudeMessages: {
    method: "GET",
    path: "/claude/messages",
    auth: "claude",
    query: claudeMessagesQuerySchema,
    response: claudeMessagesResponseSchema,
  },
} as const satisfies Record<string, Route>;

export type RouteName = keyof typeof routes;

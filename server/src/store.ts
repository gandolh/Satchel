import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  CLAUDE_DISPLAY_NAME,
  CLAUDE_MEMBER,
  PAGE_LIMIT_DEFAULT,
  nextSeenUpTo,
  unreadCount,
  type ClaudeTokenSummary,
  type ConversationKind,
  type ConversationSummary,
  type Member,
  type Message,
  type RevokeClaudeTokenResponse,
} from "@satchel/shared";
import type { Clock } from "./clock.js";
import type { Db } from "./db/open.js";

/** The client ID is already stored for a different conversation, sender or text. Routes answer 409. */
export class ClientIdConflict extends Error {
  constructor(readonly clientId: string) {
    super(`Client ID ${clientId} is already used by a different message.`);
    this.name = "ClientIdConflict";
  }
}

/** A member-scoped call for someone who isn't a member. Routes check membership first, so this is a bug. */
export class NotAMember extends Error {
  constructor(
    readonly conversationId: string,
    readonly member: string,
  ) {
    super(`${member} is not a member of conversation ${conversationId}.`);
    this.name = "NotAMember";
  }
}

export interface AppendMessageInput {
  conversationId: string;
  sender: string;
  clientId: string;
  /** Already normalised by `messageTextSchema`; stored exactly as given. */
  text: string;
}

export interface ListMessagesOptions {
  /** Only messages with seq above this. Default 0. */
  after?: number;
  /** At most this many. Default `PAGE_LIMIT_DEFAULT`; the route enforces the maximum. */
  limit?: number;
  /** Only messages with `sentAt` at or after this `toISOString()` value. */
  since?: string;
}

export interface CreatedClaudeToken {
  id: string;
  token: string;
  createdAt: string;
}

export interface ResolvedClaudeToken {
  tokenId: string;
  ownerSubject: string;
  conversationId: string;
}

interface ConversationRow {
  id: string;
  kind: ConversationKind;
  title: string | null;
  rowid: number;
}

interface MemberRow {
  member: string;
  seen_up_to: number;
  seen_at: string | null;
  display_name: string | null;
}

interface MessageRow {
  seq: number;
  conversation_id: string;
  sender: string;
  client_id: string;
  text: string;
  sent_at: string;
}

interface TokenRow {
  id: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const MESSAGE_COLUMNS = "seq, conversation_id, sender, client_id, text, sent_at";
const TOKEN_PREFIX = "stl_";

function toMessage(row: MessageRow): Message {
  return {
    seq: row.seq,
    conversationId: row.conversation_id,
    sender: row.sender,
    clientId: row.client_id,
    text: row.text,
    sentAt: row.sent_at,
  };
}

function toMember(row: MemberRow): Member {
  return {
    id: row.member,
    displayName: row.member === CLAUDE_MEMBER ? CLAUDE_DISPLAY_NAME : (row.display_name ?? row.member),
    seenUpTo: row.seen_up_to,
    seenAt: row.seen_at,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createStore(db: Db, clock: Clock) {
  const now = () => clock().toISOString();

  const upsertAccountStmt = db.prepare<{ subject: string; displayName: string; now: string }>(
    `INSERT INTO accounts (subject, display_name, created_at, last_seen_at)
     VALUES (@subject, @displayName, @now, @now)
     ON CONFLICT (subject) DO UPDATE SET display_name = excluded.display_name, last_seen_at = excluded.last_seen_at`,
  );
  const findInboxStmt = db.prepare<[string], { id: string }>(
    "SELECT id FROM conversations WHERE kind = 'inbox' AND created_by = ?",
  );
  const insertConversationStmt = db.prepare<{
    id: string;
    kind: ConversationKind;
    title: string | null;
    createdBy: string;
    createdAt: string;
  }>(
    `INSERT INTO conversations (id, kind, title, created_by, created_at)
     VALUES (@id, @kind, @title, @createdBy, @createdAt)`,
  );
  const insertMemberStmt = db.prepare<[string, string, string]>(
    "INSERT INTO members (conversation_id, member, joined_at) VALUES (?, ?, ?)",
  );
  const conversationsOfStmt = db.prepare<[string], ConversationRow>(
    `SELECT c.id, c.kind, c.title, c.rowid AS rowid
     FROM conversations c JOIN members m ON m.conversation_id = c.id
     WHERE m.member = ?`,
  );
  const conversationOfStmt = db.prepare<[string, string], ConversationRow>(
    `SELECT c.id, c.kind, c.title, c.rowid AS rowid
     FROM conversations c JOIN members m ON m.conversation_id = c.id
     WHERE c.id = ? AND m.member = ?`,
  );
  const membersStmt = db.prepare<[string], MemberRow>(
    `SELECT m.member, m.seen_up_to, m.seen_at, a.display_name
     FROM members m LEFT JOIN accounts a ON a.subject = m.member
     WHERE m.conversation_id = ?
     ORDER BY m.joined_at, m.rowid`,
  );
  const markerStmt = db.prepare<[string, string], { seen_up_to: number }>(
    "SELECT seen_up_to FROM members WHERE conversation_id = ? AND member = ?",
  );
  const setMarkerStmt = db.prepare<[number, string, string, string]>(
    "UPDATE members SET seen_up_to = ?, seen_at = ? WHERE conversation_id = ? AND member = ?",
  );
  const lastMessageStmt = db.prepare<[string], MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT 1`,
  );
  const latestSeqStmt = db.prepare<[string], { seq: number }>(
    "SELECT COALESCE(MAX(seq), 0) AS seq FROM messages WHERE conversation_id = ?",
  );
  const aboveMarkerStmt = db.prepare<[string, number], Pick<Message, "seq" | "sender">>(
    "SELECT seq, sender FROM messages WHERE conversation_id = ? AND seq > ?",
  );
  const listMessagesStmt = db.prepare<
    { conversationId: string; after: number; limit: number; since: string | null },
    MessageRow
  >(
    `SELECT ${MESSAGE_COLUMNS} FROM messages
     WHERE conversation_id = @conversationId AND seq > @after AND (@since IS NULL OR sent_at >= @since)
     ORDER BY seq LIMIT @limit`,
  );
  const unreadStmt = db.prepare<[string, number, string], MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM messages
     WHERE conversation_id = ? AND seq > ? AND sender <> ?
     ORDER BY seq`,
  );
  const messageByClientIdStmt = db.prepare<[string], MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM messages WHERE client_id = ?`,
  );
  const insertMessageStmt = db.prepare<
    { conversationId: string; sender: string; clientId: string; text: string; sentAt: string },
    MessageRow
  >(
    `INSERT INTO messages (conversation_id, sender, client_id, text, sent_at)
     VALUES (@conversationId, @sender, @clientId, @text, @sentAt)
     RETURNING ${MESSAGE_COLUMNS}`,
  );
  const insertTokenStmt = db.prepare<{
    id: string;
    ownerSubject: string;
    conversationId: string;
    tokenHash: string;
    createdAt: string;
  }>(
    `INSERT INTO agent_tokens (id, owner_subject, conversation_id, token_hash, created_at)
     VALUES (@id, @ownerSubject, @conversationId, @tokenHash, @createdAt)`,
  );
  const resolveTokenStmt = db.prepare<
    [string, string],
    { id: string; owner_subject: string; conversation_id: string }
  >(
    `UPDATE agent_tokens SET last_used_at = ?
     WHERE token_hash = ? AND revoked_at IS NULL
     RETURNING id, owner_subject, conversation_id`,
  );
  const listTokensStmt = db.prepare<[string], TokenRow>(
    `SELECT id, created_at, last_used_at, revoked_at FROM agent_tokens
     WHERE owner_subject = ? ORDER BY rowid DESC`,
  );
  const revokeTokenStmt = db.prepare<[string, string, string], { id: string; revoked_at: string }>(
    `UPDATE agent_tokens SET revoked_at = COALESCE(revoked_at, ?)
     WHERE id = ? AND owner_subject = ?
     RETURNING id, revoked_at`,
  );
  const revokeAllTokensStmt = db.prepare<[string, string]>(
    "UPDATE agent_tokens SET revoked_at = ? WHERE owner_subject = ? AND revoked_at IS NULL",
  );

  function markerOf(conversationId: string, member: string): number {
    const row = markerStmt.get(conversationId, member);
    if (row === undefined) throw new NotAMember(conversationId, member);
    return row.seen_up_to;
  }

  function latestSeq(conversationId: string): number {
    return latestSeqStmt.get(conversationId)?.seq ?? 0;
  }

  function moveMarker(conversationId: string, member: string, upTo: number): number {
    const current = markerOf(conversationId, member);
    const next = nextSeenUpTo(current, upTo, latestSeq(conversationId));
    if (next !== current) setMarkerStmt.run(next, now(), conversationId, member);
    return next;
  }

  function summarize(row: ConversationRow, subject: string): ConversationSummary {
    const members = membersStmt.all(row.id).map(toMember);
    const last = lastMessageStmt.get(row.id);
    const seenUpTo = markerOf(row.id, subject);
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      members,
      lastMessage: last === undefined ? null : toMessage(last),
      unreadCount: unreadCount(aboveMarkerStmt.all(row.id, seenUpTo), { id: subject, seenUpTo }),
    };
  }

  const ensureInboxTx = db.transaction((subject: string): string => {
    const existing = findInboxStmt.get(subject);
    if (existing !== undefined) return existing.id;
    const id = randomUUID();
    const createdAt = now();
    insertConversationStmt.run({ id, kind: "inbox", title: null, createdBy: subject, createdAt });
    insertMemberStmt.run(id, subject, createdAt);
    insertMemberStmt.run(id, CLAUDE_MEMBER, createdAt);
    return id;
  });

  // Inbox first, then by last message seq (newest first); conversations with no
  // messages go last, newest created first. Seq rather than sentAt, so equal
  // timestamps still order deterministically.
  const listConversationsTx = db.transaction((subject: string): ConversationSummary[] => {
    const rows = conversationsOfStmt.all(subject);
    return rows
      .map((row) => ({ row, summary: summarize(row, subject) }))
      .sort(
        (a, b) =>
          Number(b.row.kind === "inbox") - Number(a.row.kind === "inbox") ||
          (b.summary.lastMessage?.seq ?? 0) - (a.summary.lastMessage?.seq ?? 0) ||
          b.row.rowid - a.row.rowid,
      )
      .map(({ summary }) => summary);
  });

  const getConversationTx = db.transaction(
    (id: string, subject: string): ConversationSummary | null => {
      const row = conversationOfStmt.get(id, subject);
      return row === undefined ? null : summarize(row, subject);
    },
  );

  const appendMessageTx = db.transaction(
    (input: AppendMessageInput): { message: Message; created: boolean } => {
      const existing = messageByClientIdStmt.get(input.clientId);
      if (existing !== undefined) {
        const sameMessage =
          existing.conversation_id === input.conversationId &&
          existing.sender === input.sender &&
          existing.text === input.text;
        if (!sameMessage) throw new ClientIdConflict(input.clientId);
        return { message: toMessage(existing), created: false };
      }
      const { conversationId, sender, clientId, text } = input;
      const row = insertMessageStmt.get({ conversationId, sender, clientId, text, sentAt: now() });
      if (row === undefined) throw new Error("INSERT … RETURNING returned no row.");
      moveMarker(conversationId, sender, row.seq);
      return { message: toMessage(row), created: true };
    },
  );

  const markSeenTx = db.transaction(moveMarker);

  const unreadForTx = db.transaction((conversationId: string, member: string): Message[] =>
    unreadStmt.all(conversationId, markerOf(conversationId, member), member).map(toMessage),
  );

  const createClaudeTokenTx = db.transaction((ownerSubject: string): CreatedClaudeToken => {
    const conversationId = ensureInboxTx(ownerSubject);
    const id = randomUUID();
    const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
    const createdAt = now();
    insertTokenStmt.run({ id, ownerSubject, conversationId, tokenHash: hashToken(token), createdAt });
    return { id, token, createdAt };
  });

  return {
    /** Inserts the account, or updates its display name and `last_seen_at`. Call before anything that names the subject. */
    upsertAccount(subject: string, displayName: string): void {
      upsertAccountStmt.run({ subject, displayName, now: now() });
    },

    /** The subject's Ideas inbox id, creating it with members `subject` and `claude` if missing. The account must exist. */
    ensureInbox(subject: string): string {
      return ensureInboxTx(subject);
    },

    /** The subject's conversations: inbox first, then newest last message, then empty ones newest created. */
    listConversations(subject: string): ConversationSummary[] {
      return listConversationsTx(subject);
    },

    /** Null when the conversation doesn't exist or `subject` isn't a member. */
    getConversation(id: string, subject: string): ConversationSummary | null {
      return getConversationTx(id, subject);
    },

    /** Ascending by seq. */
    listMessages(conversationId: string, options: ListMessagesOptions = {}): Message[] {
      return listMessagesStmt
        .all({
          conversationId,
          after: options.after ?? 0,
          limit: options.limit ?? PAGE_LIMIT_DEFAULT,
          since: options.since ?? null,
        })
        .map(toMessage);
    },

    /** 0 when the conversation has no messages. */
    latestSeq,

    /**
     * Stores the message and moves the sender's seen marker to it. A repeated
     * client ID with the same conversation, sender and text returns the stored
     * row with `created: false`; any other reuse throws `ClientIdConflict`.
     * A sender who isn't a member throws `NotAMember` and nothing is stored.
     */
    appendMessage(input: AppendMessageInput): { message: Message; created: boolean } {
      return appendMessageTx(input);
    },

    /** The member's marker after moving it forward to `upTo`, clamped to the latest seq. Throws `NotAMember`. */
    markSeen(conversationId: string, member: string, upTo: number): number {
      return markSeenTx(conversationId, member, upTo);
    },

    /** The member's current marker. Throws `NotAMember`. */
    seenUpTo(conversationId: string, member: string): number {
      return markerOf(conversationId, member);
    },

    /** Messages above the member's marker not sent by them, ascending. Throws `NotAMember`. */
    unreadFor(conversationId: string, member: string): Message[] {
      return unreadForTx(conversationId, member);
    },

    /** The only place the token exists in clear; only its SHA-256 hex is stored. Bound to the owner's inbox. */
    createClaudeToken(ownerSubject: string): CreatedClaudeToken {
      return createClaudeTokenTx(ownerSubject);
    },

    /** Null when unknown or revoked. Updates `last_used_at` on a hit. */
    resolveClaudeToken(token: string): ResolvedClaudeToken | null {
      const row = resolveTokenStmt.get(now(), hashToken(token));
      return row === undefined
        ? null
        : { tokenId: row.id, ownerSubject: row.owner_subject, conversationId: row.conversation_id };
    },

    /** Newest first. Never the token or its hash. */
    listClaudeTokens(ownerSubject: string): ClaudeTokenSummary[] {
      return listTokensStmt.all(ownerSubject).map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        revokedAt: row.revoked_at,
      }));
    },

    /** Sets `revoked_at` the first time; later calls return the original time. Null for an unknown id or another owner's token. */
    revokeClaudeToken(ownerSubject: string, id: string): RevokeClaudeTokenResponse | null {
      const row = revokeTokenStmt.get(now(), id, ownerSubject);
      return row === undefined ? null : { id: row.id, revokedAt: row.revoked_at };
    },

    /**
     * Revokes every live token the subject owns; returns how many. Already
     * revoked ones keep their `revoked_at`. A subject with no account is a
     * no-op: nothing is created.
     */
    revokeAllClaudeTokens(ownerSubject: string): number {
      return revokeAllTokensStmt.run(now(), ownerSubject).changes;
    },
  };
}

export type Store = ReturnType<typeof createStore>;

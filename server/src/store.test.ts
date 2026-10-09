import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLAUDE_DISPLAY_NAME,
  CLAUDE_MEMBER,
  claudeTokensResponseSchema,
  conversationSummarySchema,
  createClaudeTokenResponseSchema,
  messageSchema,
  revokeClaudeTokenResponseSchema,
} from "@satchel/shared";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, migrations } from "./db/migrations.js";
import { databasePath, openDb, type Db } from "./db/open.js";
import { ClientIdConflict, NotAMember, UnknownAccount, createStore, directKey, type Store } from "./store.js";

const A = "subject-a";
const B = "subject-b";
const C = "subject-c";
const T0 = "2026-10-09T08:00:00.000Z";

let db: Db;
let store: Store;
let current: Date;

function advance(ms = 60_000): string {
  current = new Date(current.getTime() + ms);
  return current.toISOString();
}

function send(conversationId: string, sender: string, text: string, clientId: string = randomUUID()) {
  return store.appendMessage({ conversationId, sender, clientId, text });
}

function marker(conversationId: string, member: string) {
  return db
    .prepare<[string, string], { seen_up_to: number; seen_at: string | null }>(
      "SELECT seen_up_to, seen_at FROM members WHERE conversation_id = ? AND member = ?",
    )
    .get(conversationId, member);
}

function messageCount(): number {
  return db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM messages").get()?.n ?? -1;
}

/** A group built with SQL, without `createGroup`'s checks, so tests can shape members freely. */
function createGroup(createdBy: string, members: string[]): string {
  const id = randomUUID();
  const at = current.toISOString();
  db.prepare("INSERT INTO conversations (id, kind, title, created_by, created_at) VALUES (?, 'group', ?, ?, ?)").run(
    id,
    "Friends",
    createdBy,
    at,
  );
  for (const member of members) {
    db.prepare("INSERT INTO members (conversation_id, member, joined_at) VALUES (?, ?, ?)").run(id, member, at);
  }
  return id;
}

beforeEach(() => {
  current = new Date(T0);
  db = openDb(":memory:");
  store = createStore(db, () => new Date(current));
  store.upsertAccount(A, "Alice");
  store.upsertAccount(B, "Bob");
  store.upsertAccount(C, "Cora");
});

afterEach(() => {
  db.close();
});

describe("openDb and migrations", () => {
  it("sets the pragmas and migrates a file database, creating its directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "satchel-store-"));
    try {
      const path = databasePath(join(dir, "nested", "data"));
      expect(path.endsWith(join("nested", "data", "satchel.db"))).toBe(true);
      const fileDb = openDb(path);
      expect(fileDb.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(fileDb.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(fileDb.pragma("busy_timeout", { simple: true })).toBe(5000);
      expect(fileDb.pragma("user_version", { simple: true })).toBe(migrations.length);
      fileDb.close();

      const reopened = openDb(path);
      expect(reopened.pragma("user_version", { simple: true })).toBe(migrations.length);
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("enforces foreign keys", () => {
    expect(() => store.ensureInbox("no-such-account")).toThrow(/FOREIGN KEY/);
  });

  it("rolls a failing migration back, version included", () => {
    const fresh = new Database(":memory:");
    expect(() => migrate(fresh, ["CREATE TABLE one (a)", "CREATE TABLE two (a); NOT SQL"])).toThrow();
    expect(fresh.pragma("user_version", { simple: true })).toBe(1);
    const tables = fresh
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE name IN ('one', 'two')")
      .all()
      .map((row) => row.name);
    expect(tables).toEqual(["one"]);
    fresh.close();
  });

  it("migration 2 adds direct_key to a version-1 database and keeps its rows", () => {
    const old = new Database(":memory:");
    old.pragma("foreign_keys = ON");
    migrate(old, migrations.slice(0, 1));
    old.prepare("INSERT INTO accounts VALUES (?, 'Alice', ?, ?)").run(A, T0, T0);
    old.prepare("INSERT INTO conversations VALUES ('inbox-a', 'inbox', NULL, ?, ?)").run(A, T0);

    migrate(old);

    expect(old.pragma("user_version", { simple: true })).toBe(2);
    expect(old.prepare("SELECT id, kind, direct_key FROM conversations").all()).toEqual([
      { id: "inbox-a", kind: "inbox", direct_key: null },
    ]);
    old.close();
  });

  it("only a direct conversation has a direct_key, and a pair has one at most", () => {
    const insert = (id: string, kind: string, key: string | null) =>
      db
        .prepare("INSERT INTO conversations (id, kind, title, created_by, created_at, direct_key) VALUES (?, ?, NULL, ?, ?, ?)")
        .run(id, kind, A, T0, key);
    insert("d1", "direct", directKey(A, B));
    expect(() => insert("d2", "direct", directKey(B, A))).toThrow(/UNIQUE/);
    expect(() => insert("d3", "direct", null)).toThrow(/CHECK/);
    expect(() => insert("g1", "group", directKey(A, C))).toThrow(/CHECK/);
    expect(() => insert("i1", "inbox", directKey(A, C))).toThrow(/CHECK/);
  });

  it("refuses a database newer than the code", () => {
    db.pragma(`user_version = ${migrations.length + 1}`);
    expect(() => migrate(db)).toThrow(/newer server/);
  });
});

describe("messages are append-only", () => {
  it("rejects UPDATE and DELETE run directly against the database", () => {
    const inbox = store.ensureInbox(A);
    send(inbox, A, "first");
    expect(() => db.prepare("UPDATE messages SET text = ?").run("changed")).toThrow(/messages are append-only/);
    expect(() => db.prepare("DELETE FROM messages").run()).toThrow(/messages are append-only/);
    expect(store.listMessages(inbox).map((m) => m.text)).toEqual(["first"]);
  });
});

describe("accounts and the inbox", () => {
  it("upsertAccount updates the name and last_seen_at but keeps created_at", () => {
    const later = advance();
    store.upsertAccount(A, "Alice B.");
    const row = db.prepare<[string], Record<string, string>>("SELECT * FROM accounts WHERE subject = ?").get(A);
    expect(row).toEqual({ subject: A, display_name: "Alice B.", created_at: T0, last_seen_at: later });
  });

  it("ensureInbox twice gives one inbox with members subject and claude", () => {
    const first = store.ensureInbox(A);
    const second = store.ensureInbox(A);
    expect(second).toBe(first);
    const inboxes = db
      .prepare<[string], { n: number }>("SELECT COUNT(*) AS n FROM conversations WHERE created_by = ? AND kind = 'inbox'")
      .get(A);
    expect(inboxes?.n).toBe(1);

    const summary = store.getConversation(first, A);
    expect(summary).toEqual({
      id: first,
      kind: "inbox",
      title: null,
      members: [
        { id: A, displayName: "Alice", seenUpTo: 0, seenAt: null },
        { id: CLAUDE_MEMBER, displayName: CLAUDE_DISPLAY_NAME, seenUpTo: 0, seenAt: null },
      ],
      lastMessage: null,
      unreadCount: 0,
    });
    expect(conversationSummarySchema.parse(summary)).toEqual(summary);
  });

  it("the database allows only one inbox per account", () => {
    store.ensureInbox(A);
    expect(() =>
      db
        .prepare("INSERT INTO conversations (id, kind, title, created_by, created_at) VALUES (?, 'inbox', NULL, ?, ?)")
        .run(randomUUID(), A, T0),
    ).toThrow(/UNIQUE/);
  });

  it("getConversation is null for a non-member and for an unknown id", () => {
    const inbox = store.ensureInbox(A);
    expect(store.getConversation(inbox, B)).toBeNull();
    expect(store.getConversation(randomUUID(), A)).toBeNull();
    expect(store.getConversation(inbox, CLAUDE_MEMBER)?.id).toBe(inbox);
  });
});

describe("appendMessage", () => {
  it("stores the text exactly and returns a message that matches the shared schema", () => {
    const inbox = store.ensureInbox(A);
    const text = "  two lines\nwith spaces  ";
    const { message, created } = send(inbox, A, text);
    expect(created).toBe(true);
    expect(message).toEqual({
      seq: 1,
      conversationId: inbox,
      sender: A,
      clientId: message.clientId,
      text,
      sentAt: T0,
    });
    expect(messageSchema.parse(message)).toEqual(message);
  });

  it("the same client ID twice stores one row and returns created: false", () => {
    const inbox = store.ensureInbox(A);
    const clientId = randomUUID();
    const first = send(inbox, A, "hello", clientId);
    advance();
    const second = send(inbox, A, "hello", clientId);
    expect(second).toEqual({ message: first.message, created: false });
    expect(messageCount()).toBe(1);
  });

  it("a client ID reused with different text, conversation or sender throws ClientIdConflict", () => {
    const inboxA = store.ensureInbox(A);
    const inboxB = store.ensureInbox(B);
    const group = createGroup(A, [A, B]);
    const clientId = randomUUID();
    send(group, A, "hello", clientId);
    expect(() => send(group, A, "hello!", clientId)).toThrow(ClientIdConflict);
    expect(() => send(inboxA, A, "hello", clientId)).toThrow(ClientIdConflict);
    expect(() => send(inboxB, B, "hello", clientId)).toThrow(ClientIdConflict);
    expect(() => send(group, B, "hello", clientId)).toThrow(ClientIdConflict);
    expect(messageCount()).toBe(1);
  });

  it("sending moves the sender's own marker", () => {
    const inbox = store.ensureInbox(A);
    const sentAt = advance();
    const { message } = send(inbox, A, "an idea");
    expect(marker(inbox, A)).toEqual({ seen_up_to: message.seq, seen_at: sentAt });
    expect(marker(inbox, CLAUDE_MEMBER)).toEqual({ seen_up_to: 0, seen_at: null });
    expect(store.getConversation(inbox, A)?.unreadCount).toBe(0);
  });
});

describe("listMessages and latestSeq", () => {
  it("pages ascending by seq with after and limit, and filters by since", () => {
    const inbox = store.ensureInbox(A);
    const other = store.ensureInbox(B);
    expect(store.latestSeq(inbox)).toBe(0);
    const seqs = ["one", "two", "three", "four"].map((text, i) => {
      if (i === 2) send(other, B, "elsewhere");
      advance();
      return send(inbox, A, text).message.seq;
    });
    expect(seqs).toEqual([1, 2, 4, 5]);
    expect(store.latestSeq(inbox)).toBe(5);
    expect(store.latestSeq(other)).toBe(3);

    expect(store.listMessages(inbox).map((m) => m.seq)).toEqual([1, 2, 4, 5]);
    expect(store.listMessages(inbox, { after: 0, limit: 2 }).map((m) => m.seq)).toEqual([1, 2]);
    expect(store.listMessages(inbox, { after: 2, limit: 2 }).map((m) => m.seq)).toEqual([4, 5]);
    expect(store.listMessages(inbox, { after: 5 })).toEqual([]);

    const third = store.listMessages(inbox, { after: 2, limit: 1 })[0];
    expect(store.listMessages(inbox, { since: third?.sentAt }).map((m) => m.seq)).toEqual([4, 5]);
  });
});

describe("markSeen", () => {
  it("never lowers the marker, clamps to the latest seq, and leaves seen_at alone when nothing moves", () => {
    const inbox = store.ensureInbox(A);
    for (const text of ["a", "b", "c"]) send(inbox, A, text);

    const firstMove = advance();
    expect(store.markSeen(inbox, CLAUDE_MEMBER, 2)).toBe(2);
    expect(marker(inbox, CLAUDE_MEMBER)).toEqual({ seen_up_to: 2, seen_at: firstMove });

    advance();
    expect(store.markSeen(inbox, CLAUDE_MEMBER, 1)).toBe(2);
    expect(store.markSeen(inbox, CLAUDE_MEMBER, 2)).toBe(2);
    expect(marker(inbox, CLAUDE_MEMBER)).toEqual({ seen_up_to: 2, seen_at: firstMove });

    const clamped = advance();
    expect(store.markSeen(inbox, CLAUDE_MEMBER, 99)).toBe(3);
    expect(marker(inbox, CLAUDE_MEMBER)).toEqual({ seen_up_to: 3, seen_at: clamped });
    expect(store.seenUpTo(inbox, CLAUDE_MEMBER)).toBe(3);
  });

  it("clamps to the conversation's own latest seq, not the global one", () => {
    const inbox = store.ensureInbox(A);
    const other = store.ensureInbox(B);
    send(inbox, A, "mine");
    send(other, B, "theirs");
    expect(store.markSeen(inbox, CLAUDE_MEMBER, 2)).toBe(1);
  });

  it("throws NotAMember for someone outside the conversation", () => {
    const inbox = store.ensureInbox(A);
    send(inbox, A, "private");
    expect(() => store.markSeen(inbox, B, 1)).toThrow(NotAMember);
    expect(() => store.unreadFor(inbox, B)).toThrow(NotAMember);
    expect(() => store.seenUpTo(inbox, B)).toThrow(NotAMember);
    const intruderClientId = randomUUID();
    expect(() => send(inbox, B, "intruder", intruderClientId)).toThrow(NotAMember);
    // The insert ran before the membership check threw; the transaction rolled it back.
    expect(messageCount()).toBe(1);
    expect(store.latestSeq(inbox)).toBe(1);
    expect(store.listMessages(inbox).map((m) => m.text)).toEqual(["private"]);
    // The client ID was never stored, so it is still free for a new message.
    expect(send(inbox, A, "retry", intruderClientId).created).toBe(true);
  });
});

describe("unreadFor", () => {
  it("handles the race: read #1-#4, #5 arrives, mark up to #4, only #5 stays unread", () => {
    const inbox = store.ensureInbox(A);
    for (const text of ["1", "2", "3", "4"]) send(inbox, A, text);

    const read = store.unreadFor(inbox, CLAUDE_MEMBER);
    expect(read.map((m) => m.seq)).toEqual([1, 2, 3, 4]);

    const fifth = send(inbox, A, "5").message;
    const lastRead = read.at(-1)?.seq ?? 0;
    expect(store.markSeen(inbox, CLAUDE_MEMBER, lastRead)).toBe(4);

    expect(store.unreadFor(inbox, CLAUDE_MEMBER)).toEqual([fifth]);
  });

  it("leaves out the member's own messages", () => {
    const group = createGroup(A, [A, B, C]);
    const fromA = send(group, A, "from a").message;
    const fromB = send(group, B, "from b").message;
    expect(store.unreadFor(group, A)).toEqual([fromB]);
    expect(store.unreadFor(group, B)).toEqual([]);
    expect(store.unreadFor(group, C)).toEqual([fromA, fromB]);
  });
});

describe("listConversations", () => {
  it("counts unread for the requesting subject", () => {
    const group = createGroup(A, [A, B, C]);
    send(group, B, "b1");
    send(group, C, "c1");
    const fromA = send(group, A, "a1").message;
    send(group, B, "b2");

    const unread = (subject: string) => store.listConversations(subject).find((c) => c.id === group)?.unreadCount;
    expect(unread(A)).toBe(1);
    expect(unread(B)).toBe(0);
    expect(unread(C)).toBe(2);

    store.markSeen(group, C, fromA.seq);
    expect(unread(C)).toBe(1);
    store.markSeen(group, C, 99);
    expect(unread(C)).toBe(0);
  });

  it("counts Claude's messages as unread for the owner in the inbox", () => {
    const inbox = store.ensureInbox(A);
    send(inbox, A, "an idea");
    send(inbox, CLAUDE_MEMBER, "noted");
    expect(store.listConversations(A)[0]?.unreadCount).toBe(1);
  });

  it("puts the inbox first, then the newest last message, and only lists the subject's conversations", () => {
    const quiet = createGroup(B, [A, B]);
    advance();
    const older = createGroup(A, [A, B]);
    const newer = createGroup(A, [A, C]);
    const inbox = store.ensureInbox(A);
    store.ensureInbox(B);
    send(newer, C, "first");
    send(older, B, "second");
    send(inbox, A, "an idea");
    const empty = createGroup(A, [A, B]);

    const list = store.listConversations(A);
    expect(list.map((c) => c.id)).toEqual([inbox, older, newer, empty, quiet]);
    expect(list.find((c) => c.id === older)?.lastMessage?.text).toBe("second");
    for (const summary of list) expect(conversationSummarySchema.parse(summary)).toEqual(summary);

    expect(store.listConversations(C).map((c) => c.id)).toEqual([newer]);
  });

  it("names members from their accounts and Claude from the shared constant", () => {
    const inbox = store.ensureInbox(A);
    store.upsertAccount(A, "Alice Renamed");
    expect(store.listConversations(A)[0]?.members.map((m) => [m.id, m.displayName])).toEqual([
      [A, "Alice Renamed"],
      [CLAUDE_MEMBER, CLAUDE_DISPLAY_NAME],
    ]);
    expect(store.listConversations(A)[0]?.id).toBe(inbox);
  });
});

describe("listPeople", () => {
  it("every other account by display name, ignoring case, never the subject or Claude", () => {
    store.upsertAccount("subject-d", "adam");
    store.upsertAccount(CLAUDE_MEMBER, "Not Claude");
    expect(store.listPeople(A)).toEqual([
      { subject: "subject-d", displayName: "adam" },
      { subject: B, displayName: "Bob" },
      { subject: C, displayName: "Cora" },
    ]);
    expect(store.listPeople(B).map((p) => p.subject)).toEqual(["subject-d", A, C]);
  });
});

describe("createDirect", () => {
  it("makes the conversation with both members at marker 0, as the caller sees it", () => {
    const { conversation, created } = store.createDirect(A, B);
    expect(created).toBe(true);
    expect(conversation).toEqual({
      id: conversation.id,
      kind: "direct",
      title: null,
      members: [
        { id: A, displayName: "Alice", seenUpTo: 0, seenAt: null },
        { id: B, displayName: "Bob", seenUpTo: 0, seenAt: null },
      ],
      lastMessage: null,
      unreadCount: 0,
    });
    expect(conversationSummarySchema.parse(conversation)).toEqual(conversation);
    const row = db.prepare<[string], { direct_key: string; created_by: string }>(
      "SELECT direct_key, created_by FROM conversations WHERE id = ?",
    );
    expect(row.get(conversation.id)).toEqual({ direct_key: [A, B].sort().join(" "), created_by: A });
  });

  it("returns the pair's existing conversation from either side, with created: false", () => {
    const first = store.createDirect(A, B).conversation;
    send(first.id, B, "hello");
    const again = store.createDirect(A, B);
    const reverse = store.createDirect(B, A);

    expect(again.created).toBe(false);
    expect(reverse.created).toBe(false);
    expect(again.conversation.id).toBe(first.id);
    expect(reverse.conversation.id).toBe(first.id);
    expect(again.conversation.unreadCount).toBe(1);
    expect(reverse.conversation.unreadCount).toBe(0);
    expect(store.createDirect(A, C).conversation.id).not.toBe(first.id);
  });

  it("throws UnknownAccount for a subject with no account, or Claude, and stores nothing", () => {
    const count = () => db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM conversations").get()?.n;
    expect(() => store.createDirect(A, "subject-nobody")).toThrow(UnknownAccount);
    expect(() => store.createDirect(A, CLAUDE_MEMBER)).toThrow(UnknownAccount);
    expect(() => store.createDirect(A, A)).toThrow();
    expect(count()).toBe(0);
  });
});

describe("createGroup", () => {
  it("makes the group with the creator first, every member at marker 0, as the creator sees it", () => {
    const group = store.createGroup(A, "Hike", [C, B]);
    expect(group).toEqual({
      id: group.id,
      kind: "group",
      title: "Hike",
      members: [
        { id: A, displayName: "Alice", seenUpTo: 0, seenAt: null },
        { id: C, displayName: "Cora", seenUpTo: 0, seenAt: null },
        { id: B, displayName: "Bob", seenUpTo: 0, seenAt: null },
      ],
      lastMessage: null,
      unreadCount: 0,
    });
    for (const member of [A, B, C]) expect(store.listConversations(member).map((c) => c.id)).toContain(group.id);
    expect(db.prepare("SELECT direct_key FROM conversations WHERE id = ?").get(group.id)).toEqual({ direct_key: null });
  });

  it("throws UnknownAccount when a member has no account, and stores nothing", () => {
    expect(() => store.createGroup(A, "Hike", [B, "subject-nobody"])).toThrow(UnknownAccount);
    expect(() => store.createGroup(A, "Hike", [B, CLAUDE_MEMBER])).toThrow(UnknownAccount);
    expect(() => store.createGroup(A, "Hike", [A, B])).toThrow();
    expect(() => store.createGroup(A, "Hike", [B, B])).toThrow();
    expect(db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM conversations").get()?.n).toBe(0);
    expect(db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM members").get()?.n).toBe(0);
  });
});

describe("Claude tokens", () => {
  function sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  it("creates a stl_ token bound to the owner's inbox and stores only its hash", () => {
    const created = store.createClaudeToken(A);
    expect(createClaudeTokenResponseSchema.parse(created)).toEqual(created);
    expect(created.token).toMatch(/^stl_[A-Za-z0-9_-]{43}$/);
    expect(created.createdAt).toBe(T0);

    const row = db.prepare<[string], Record<string, unknown>>("SELECT * FROM agent_tokens WHERE id = ?").get(created.id);
    expect(row).toEqual({
      id: created.id,
      owner_subject: A,
      conversation_id: store.ensureInbox(A),
      token_hash: sha256(created.token),
      created_at: T0,
      last_used_at: null,
      revoked_at: null,
    });
    const everything = JSON.stringify(db.prepare("SELECT * FROM agent_tokens").all());
    expect(everything).not.toContain(created.token);
    expect(everything).not.toContain(created.token.slice(4));
  });

  it("creates the inbox when the owner has none yet", () => {
    const { token } = store.createClaudeToken(B);
    expect(store.resolveClaudeToken(token)?.conversationId).toBe(store.ensureInbox(B));
  });

  it("resolves a live token and updates last_used_at", () => {
    const { id, token } = store.createClaudeToken(A);
    const usedAt = advance();
    expect(store.resolveClaudeToken(token)).toEqual({
      tokenId: id,
      ownerSubject: A,
      conversationId: store.ensureInbox(A),
    });
    expect(store.listClaudeTokens(A)).toEqual([{ id, createdAt: T0, lastUsedAt: usedAt, revokedAt: null }]);
  });

  it("resolves an unknown or altered token to null", () => {
    const { token } = store.createClaudeToken(A);
    expect(store.resolveClaudeToken("stl_unknown")).toBeNull();
    expect(store.resolveClaudeToken(`${token}x`)).toBeNull();
    expect(store.resolveClaudeToken(sha256(token))).toBeNull();
    expect(store.resolveClaudeToken("")).toBeNull();
  });

  it("a revoked token resolves to null, and revoking sets revoked_at once", () => {
    const { id, token } = store.createClaudeToken(A);
    const revokedAt = advance();
    const revoked = store.revokeClaudeToken(A, id);
    expect(revoked).toEqual({ id, revokedAt });
    expect(revokeClaudeTokenResponseSchema.parse(revoked)).toEqual(revoked);
    expect(store.resolveClaudeToken(token)).toBeNull();

    advance();
    expect(store.revokeClaudeToken(A, id)).toEqual({ id, revokedAt });
    expect(store.listClaudeTokens(A)[0]?.revokedAt).toBe(revokedAt);
  });

  it("one owner can't revoke another's token", () => {
    const { id, token } = store.createClaudeToken(A);
    expect(store.revokeClaudeToken(B, id)).toBeNull();
    expect(store.revokeClaudeToken(A, randomUUID())).toBeNull();
    expect(store.resolveClaudeToken(token)?.tokenId).toBe(id);
    expect(store.listClaudeTokens(A)[0]?.revokedAt).toBeNull();
  });

  it("revokeAllClaudeTokens revokes every live token of one owner and returns the count", () => {
    const first = store.createClaudeToken(A);
    const second = store.createClaudeToken(A);
    const earlier = store.createClaudeToken(A);
    const earlierRevokedAt = advance();
    store.revokeClaudeToken(A, earlier.id);
    const other = store.createClaudeToken(B);

    const revokedAt = advance();
    expect(store.revokeAllClaudeTokens(A)).toBe(2);
    expect(store.resolveClaudeToken(first.token)).toBeNull();
    expect(store.resolveClaudeToken(second.token)).toBeNull();
    const byId = new Map(store.listClaudeTokens(A).map((t) => [t.id, t.revokedAt]));
    expect(byId.get(first.id)).toBe(revokedAt);
    expect(byId.get(second.id)).toBe(revokedAt);
    expect(byId.get(earlier.id)).toBe(earlierRevokedAt);

    expect(store.resolveClaudeToken(other.token)?.tokenId).toBe(other.id);
    expect(store.revokeAllClaudeTokens(A)).toBe(0);
  });

  it("revokeAllClaudeTokens for a subject with no account changes nothing and creates no row", () => {
    const accounts = () => db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM accounts").get()?.n ?? -1;
    const before = accounts();
    expect(store.revokeAllClaudeTokens("subject-stranger")).toBe(0);
    expect(accounts()).toBe(before);
  });

  it("lists only the owner's tokens, newest first, in the strict shared shape", () => {
    const first = store.createClaudeToken(A);
    const second = store.createClaudeToken(A);
    store.createClaudeToken(B);
    const tokens = store.listClaudeTokens(A);
    expect(tokens.map((t) => t.id)).toEqual([second.id, first.id]);
    expect(claudeTokensResponseSchema.parse({ tokens })).toEqual({ tokens });
    expect(JSON.stringify(tokens)).not.toContain(first.token);
  });
});

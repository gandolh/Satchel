import { randomUUID } from "node:crypto";
import { errorResponseSchema, routes } from "@satchel/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTestApp, type TestApp } from "../ward/testing/testApp.js";

const A = { subject: "subject-a", username: "ana" };
const B = { subject: "subject-b", username: "bob" };

let t: TestApp;
let cookieA: string;
let cookieB: string;
let inboxA: string;

beforeEach(async () => {
  t = await startTestApp();
  cookieA = await t.signIn(A);
  cookieB = await t.signIn(B);
  inboxA = await inboxOf(cookieA);
});

afterEach(async () => {
  await t.close();
});

async function inboxOf(cookie: string): Promise<string> {
  const res = await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
  return (res.json() as { inboxId: string }).inboxId;
}

function send(cookie: string, id: string, payload: unknown) {
  return t.app.inject({ method: "POST", url: `/api/conversations/${id}/messages`, headers: { cookie }, payload: payload as object });
}

function read(cookie: string, id: string, query = "") {
  return t.app.inject({ method: "GET", url: `/api/conversations/${id}/messages${query}`, headers: { cookie } });
}

function seen(cookie: string, id: string, upTo: number) {
  return t.app.inject({ method: "POST", url: `/api/conversations/${id}/seen`, headers: { cookie }, payload: { upTo } });
}

function expectError(res: { statusCode: number; json(): unknown }, status: number, code: string) {
  expect(res.statusCode).toBe(status);
  expect(errorResponseSchema.parse(res.json()).error.code).toBe(code);
}

async function post3(): Promise<number[]> {
  const seqs: number[] = [];
  for (const text of ["one", "two", "three"]) {
    const res = await send(cookieA, inboxA, { clientId: randomUUID(), text });
    expect(res.statusCode).toBe(201);
    seqs.push(routes.sendMessage.response.parse(res.json()).message.seq);
  }
  return seqs;
}

describe("GET /api/conversations", () => {
  it("lists only the caller's inbox", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/conversations", headers: { cookie: cookieA } });
    expect(res.statusCode).toBe(200);
    const { conversations } = routes.listConversations.response.parse(res.json());
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({ id: inboxA, kind: "inbox" });
  });
});

describe("messages", () => {
  it("reads messages back in seq order with after paging", async () => {
    const seqs = await post3();
    const all = routes.listMessages.response.parse((await read(cookieA, inboxA)).json());
    expect(all.messages.map((m) => m.text)).toEqual(["one", "two", "three"]);
    expect(all.messages.map((m) => m.seq)).toEqual(seqs);
    expect(all.latestSeq).toBe(seqs[2]);

    const paged = routes.listMessages.response.parse((await read(cookieA, inboxA, `?after=${seqs[0]}&limit=1`)).json());
    expect(paged.messages.map((m) => m.text)).toEqual(["two"]);
    const rest = routes.listMessages.response.parse((await read(cookieA, inboxA, `?after=${seqs[1]}`)).json());
    expect(rest.messages.map((m) => m.text)).toEqual(["three"]);
  });

  it("rejects a limit above 500", async () => {
    expectError(await read(cookieA, inboxA, "?limit=501"), 400, "invalid_request");
  });

  it("answers 201 then 200 for the same client ID and stores one row", async () => {
    const clientId = randomUUID();
    const first = await send(cookieA, inboxA, { clientId, text: "idea" });
    const second = await send(cookieA, inboxA, { clientId, text: "idea" });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    const count = t.db.prepare<[string], { n: number }>("SELECT COUNT(*) AS n FROM messages WHERE client_id = ?").get(clientId);
    expect(count?.n).toBe(1);
  });

  it("answers 409 for the same client ID with different text", async () => {
    const clientId = randomUUID();
    await send(cookieA, inboxA, { clientId, text: "idea" });
    expectError(await send(cookieA, inboxA, { clientId, text: "other" }), 409, "client_id_conflict");
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "  \n "],
    ["4001 characters", "x".repeat(4001)],
  ])("rejects %s text with 400", async (_name, text) => {
    expectError(await send(cookieA, inboxA, { clientId: randomUUID(), text }), 400, "invalid_request");
  });

  it("stores the normalised text", async () => {
    const res = await send(cookieA, inboxA, { clientId: randomUUID(), text: "a\r\nb" });
    expect(routes.sendMessage.response.parse(res.json()).message.text).toBe("a\nb");
  });
});

describe("a non-member", () => {
  it("gets 404 reading, posting to and marking another's inbox, and nothing changes", async () => {
    const seqs = await post3();
    expectError(await read(cookieB, inboxA), 404, "not_found");
    expectError(await send(cookieB, inboxA, { clientId: randomUUID(), text: "hi" }), 404, "not_found");
    expectError(await seen(cookieB, inboxA, seqs[2] ?? 0), 404, "not_found");

    const after = routes.listMessages.response.parse((await read(cookieA, inboxA)).json());
    expect(after.messages).toHaveLength(3);
    expect(after.conversation.members.find((m) => m.id === A.subject)?.seenUpTo).toBe(seqs[2]);
  });

  it("gets 404 for a conversation that does not exist", async () => {
    expectError(await read(cookieA, "nope"), 404, "not_found");
  });
});

describe("seen", () => {
  it("never moves the marker back and clamps upTo to the latest seq", async () => {
    const seqs = await post3();
    const top = seqs[2] ?? 0;
    const lower = await seen(cookieA, inboxA, 1);
    expect(lower.statusCode).toBe(200);
    expect(routes.markSeen.response.parse(lower.json()).seenUpTo).toBe(top);
    const past = await seen(cookieA, inboxA, top + 1000);
    expect(routes.markSeen.response.parse(past.json()).seenUpTo).toBe(top);
  });

  it("moves the sender's own marker on send, leaving no unread", async () => {
    const seqs = await post3();
    const body = routes.listMessages.response.parse((await read(cookieA, inboxA)).json());
    expect(body.conversation.members.find((m) => m.id === A.subject)?.seenUpTo).toBe(seqs[2]);
    expect(body.conversation.unreadCount).toBe(0);
  });
});

describe("friends: people and new conversations", () => {
  const FRIEND = { satchel: ["member"] };
  const C = { subject: "subject-c", username: "cora" };
  const D = { subject: "subject-d", username: "dan" };
  let friendB: string;
  let friendC: string;
  let friendD: string;

  // A is the owner (admin); B, C and D are friends (member). Each has signed in once.
  beforeEach(async () => {
    friendB = await t.signIn({ ...B, grants: FRIEND });
    friendC = await t.signIn({ ...C, grants: FRIEND });
    friendD = await t.signIn({ ...D, grants: FRIEND });
    for (const cookie of [friendB, friendC, friendD]) {
      expect((await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).statusCode).toBe(200);
    }
  });

  async function people(cookie: string) {
    const res = await t.app.inject({ method: "GET", url: "/api/people", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    return routes.listPeople.response.parse(res.json()).people;
  }

  function start(cookie: string, payload: unknown) {
    return t.app.inject({ method: "POST", url: "/api/conversations", headers: { cookie }, payload: payload as object });
  }

  async function started(cookie: string, payload: unknown, status: number) {
    const res = await start(cookie, payload);
    expect(res.statusCode).toBe(status);
    return routes.createConversation.response.parse(res.json()).conversation;
  }

  async function list(cookie: string) {
    const res = await t.app.inject({ method: "GET", url: "/api/conversations", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    return routes.listConversations.response.parse(res.json()).conversations;
  }

  function conversationCount(): number {
    return t.db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM conversations").get()?.n ?? -1;
  }

  describe("GET /api/people", () => {
    it("lists everyone else by display name, never the caller", async () => {
      expect(await people(cookieA)).toEqual([
        { subject: B.subject, displayName: B.username },
        { subject: C.subject, displayName: C.username },
        { subject: D.subject, displayName: D.username },
      ]);
      expect((await people(friendB)).map((p) => p.subject)).toEqual([A.subject, C.subject, D.subject]);
      for (const cookie of [cookieA, friendB, friendC, friendD]) {
        const subjects = (await people(cookie)).map((p) => p.subject);
        expect(subjects).toHaveLength(3);
        expect(new Set(subjects).size).toBe(3);
      }
      expect((await people(friendC)).map((p) => p.subject)).not.toContain(C.subject);
    });

    it("shows a person only after their first sign-in", async () => {
      const E = { subject: "subject-e", username: "eve" };
      const cookieE = await t.signIn({ ...E, grants: FRIEND });
      expect((await people(cookieA)).map((p) => p.subject)).not.toContain(E.subject);
      await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie: cookieE } });
      expect((await people(cookieA)).map((p) => p.subject)).toContain(E.subject);
    });

    it("is behind the Ward guard", async () => {
      expectError(await t.app.inject({ method: "GET", url: "/api/people" }), 401, "unauthorized");
    });
  });

  describe("POST /api/conversations, direct", () => {
    it("A starting a chat with B twice gets the same conversation, and so does B starting one with A", async () => {
      const first = await started(cookieA, { kind: "direct", with: B.subject }, 201);
      expect(first).toMatchObject({ kind: "direct", title: null, lastMessage: null, unreadCount: 0 });
      expect(first.members).toEqual([
        { id: A.subject, displayName: A.username, seenUpTo: 0, seenAt: null },
        { id: B.subject, displayName: B.username, seenUpTo: 0, seenAt: null },
      ]);

      const again = await started(cookieA, { kind: "direct", with: B.subject }, 200);
      const fromB = await started(friendB, { kind: "direct", with: A.subject }, 200);
      expect(again.id).toBe(first.id);
      expect(fromB.id).toBe(first.id);
      expect(conversationCount()).toBe(2); // A's inbox and the direct chat

      expect((await list(cookieA)).map((c) => c.id)).toEqual([inboxA, first.id]);
      expect((await list(friendB)).map((c) => c.id)).toEqual([first.id]);
      expectError(await read(friendC, first.id), 404, "not_found");
    });

    it("carries messages both ways, with unread counted per member", async () => {
      const { id } = await started(friendB, { kind: "direct", with: A.subject }, 201);
      expect((await send(friendB, id, { clientId: randomUUID(), text: "hi" })).statusCode).toBe(201);
      expect((await list(cookieA)).find((c) => c.id === id)?.unreadCount).toBe(1);
      expect((await list(friendB)).find((c) => c.id === id)?.unreadCount).toBe(0);
    });

    it("friends can start chats with each other", async () => {
      const chat = await started(friendB, { kind: "direct", with: C.subject }, 201);
      expect(chat.members.map((m) => m.id)).toEqual([B.subject, C.subject]);
      expect((await list(cookieA)).map((c) => c.id)).toEqual([inboxA]);
    });

    it.each([
      ["the caller", A.subject],
      ["an unknown subject", "subject-nobody"],
      ["Claude", "claude"],
    ])("rejects a chat with %s with 400 and makes nothing", async (_label, subject) => {
      const before = conversationCount();
      expectError(await start(cookieA, { kind: "direct", with: subject }), 400, "invalid_request");
      expect(conversationCount()).toBe(before);
    });
  });

  describe("POST /api/conversations, group", () => {
    const group = { kind: "group", title: "Hike on Saturday", members: [B.subject, C.subject] };

    it("A makes a group with B and C; all three list it, and D gets 404 on it", async () => {
      const made = await started(cookieA, group, 201);
      expect(made).toMatchObject({ kind: "group", title: "Hike on Saturday", lastMessage: null, unreadCount: 0 });
      expect(made.members.map((m) => [m.id, m.displayName, m.seenUpTo])).toEqual([
        [A.subject, A.username, 0],
        [B.subject, B.username, 0],
        [C.subject, C.username, 0],
      ]);

      for (const cookie of [cookieA, friendB, friendC]) {
        expect((await list(cookie)).map((c) => c.id)).toContain(made.id);
      }
      expect(await list(friendD)).toEqual([]);
      expectError(await read(friendD, made.id), 404, "not_found");
      expectError(await send(friendD, made.id, { clientId: randomUUID(), text: "let me in" }), 404, "not_found");
      expectError(await seen(friendD, made.id, 0), 404, "not_found");
    });

    it("a second group with the same members is a new conversation", async () => {
      const first = await started(cookieA, group, 201);
      const second = await started(cookieA, group, 201);
      expect(second.id).not.toBe(first.id);
    });

    it("a friend can make a group too, and the title is trimmed", async () => {
      const made = await started(friendB, { ...group, title: "  Hike  ", members: [A.subject, C.subject] }, 201);
      expect(made.title).toBe("Hike");
      expect(made.members.map((m) => m.id)).toEqual([B.subject, A.subject, C.subject]);
    });

    it.each([
      ["no title", { kind: "group", members: [B.subject, C.subject] }],
      ["a blank title", { ...group, title: "  " }],
      ["a title over 80 characters", { ...group, title: "x".repeat(81) }],
      ["one member", { ...group, members: [B.subject] }],
      ["a duplicate member", { ...group, members: [B.subject, B.subject] }],
      ["the caller listed", { ...group, members: [A.subject, B.subject] }],
      ["an unknown subject", { ...group, members: [B.subject, "subject-nobody"] }],
      ["Claude as a member", { ...group, members: [B.subject, "claude"] }],
      ["kind inbox", { kind: "inbox" }],
      ["no body", undefined],
    ])("rejects %s with 400 and makes nothing", async (_label, payload) => {
      const before = conversationCount();
      expectError(await start(cookieA, payload), 400, "invalid_request");
      expect(conversationCount()).toBe(before);
    });

    it("counts unread and keeps a seen marker per member", async () => {
      const { id } = await started(cookieA, group, 201);
      const sent = async (cookie: string, text: string) => {
        const res = await send(cookie, id, { clientId: randomUUID(), text });
        expect(res.statusCode).toBe(201);
        return routes.sendMessage.response.parse(res.json()).message.seq;
      };
      const a1 = await sent(cookieA, "who's in?");
      const b1 = await sent(friendB, "me");
      const b2 = await sent(friendB, "bringing tea");

      const unread = async (cookie: string) => (await list(cookie)).find((c) => c.id === id)?.unreadCount;
      expect(await unread(cookieA)).toBe(2);
      expect(await unread(friendB)).toBe(0);
      expect(await unread(friendC)).toBe(3);

      expect(routes.markSeen.response.parse((await seen(friendC, id, b1)).json()).seenUpTo).toBe(b1);
      expect(await unread(friendC)).toBe(1);

      const { conversation } = routes.listMessages.response.parse((await read(cookieA, id)).json());
      expect(conversation.members.map((m) => [m.id, m.seenUpTo])).toEqual([
        [A.subject, a1],
        [B.subject, b2],
        [C.subject, b1],
      ]);
      expect(conversation.lastMessage?.seq).toBe(b2);
    });
  });

  describe("a friend has no inbox", () => {
    it("B's /api/me gives inboxId null, B's list has no inbox, and B can't create a Claude token", async () => {
      const me = await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie: friendB } });
      expect(routes.me.response.parse(me.json()).inboxId).toBeNull();

      await started(cookieA, { kind: "direct", with: B.subject }, 201);
      await started(friendB, { kind: "group", title: "Tea", members: [A.subject, C.subject] }, 201);
      const kinds = (await list(friendB)).map((c) => c.kind);
      expect(kinds.sort()).toEqual(["direct", "group"]);

      const token = await t.app.inject({ method: "POST", url: "/api/claude-tokens", headers: { cookie: friendB } });
      expectError(token, 403, "forbidden");
      expect((await list(friendB)).some((c) => c.kind === "inbox")).toBe(false);
    });
  });
});

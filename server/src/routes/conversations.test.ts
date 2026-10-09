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

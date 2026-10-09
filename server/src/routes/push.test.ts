import { randomUUID } from "node:crypto";
import { errorResponseSchema, routes } from "@satchel/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { openDb, type Db } from "../db/open.js";
import type { PushTarget, SendPush } from "../push/sender.js";
import { createStore, type Store } from "../store.js";
import { createWardClient } from "../ward/client.js";
import { SATCHEL_APP_SLUG } from "../ward/guard.js";
import { startFakeWard, type FakeWard } from "../ward/testing/fakeWard.js";
import { TEST_APP_KEY, startTestApp, wardCookie, type TestApp } from "../ward/testing/testApp.js";

/**
 * The push routes and the pushes a stored message sends (brief 14), with
 * web-push stubbed: `send` records every push instead of encrypting it.
 * `settle()` closes the app, which waits for every push already started, so
 * a test can then assert what was (and wasn't) sent.
 */

const PUBLIC_KEY = `B${"A".repeat(86)}`;
const A = { subject: "subject-a", username: "ana" };
const B = { subject: "subject-b", username: "bob", grants: { [SATCHEL_APP_SLUG]: ["member"] } };
const C = { subject: "subject-c", username: "cora", grants: { [SATCHEL_APP_SLUG]: ["member"] } };

interface Sent {
  endpoint: string;
  payload: { conversationId: string; title: string; body: string };
}

interface PushApp {
  app: FastifyInstance;
  origin: string;
  store: Store;
  db: Db;
  logs: string[];
  sent: Sent[];
  /** What the next `send` calls do; default: accepted. */
  respond: (target: PushTarget) => Promise<void>;
  signIn(who: { subject: string; username: string; grants?: Record<string, string[]> }): Promise<string>;
  /** Closes the app, waiting for every push in flight. Inject nothing after this. */
  settle(): Promise<void>;
  close(): Promise<void>;
}

async function startPushApp(): Promise<PushApp> {
  const fakeWard: FakeWard = await startFakeWard();
  fakeWard.requireAppKey(TEST_APP_KEY);
  const ward = createWardClient({ publicOrigin: fakeWard.origin, apiBasePath: "", appKey: TEST_APP_KEY });
  const db = openDb(":memory:");
  const store = createStore(db, () => new Date());
  const logs: string[] = [];
  let closed = false;

  const t: PushApp = {
    app: undefined as unknown as FastifyInstance,
    origin: fakeWard.origin,
    store,
    db,
    logs,
    sent: [],
    respond: () => Promise.resolve(),
    async signIn({ subject, username, grants = { [SATCHEL_APP_SLUG]: ["admin"] } }) {
      const sessionId = `family_${randomUUID()}`;
      fakeWard.setSession(sessionId, { active: true, subject, username, grants });
      return wardCookie(await fakeWard.mintToken({ subject, sessionId }));
    },
    async settle() {
      if (closed) return;
      closed = true;
      await t.app.close();
    },
    async close() {
      await t.settle();
      db.close();
      await fakeWard.close().catch(() => undefined);
    },
  };

  const send: SendPush = (target, payload) => {
    t.sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload) as Sent["payload"] });
    return t.respond(target);
  };
  t.app = buildApp({
    store,
    ward,
    publicOrigin: fakeWard.origin,
    clock: () => new Date(),
    push: { vapid: { publicKey: PUBLIC_KEY, privateKey: "unused", subject: "mailto:johndoe@example.com" }, send },
    logger: { level: "info", stream: { write: (line) => void logs.push(line) } },
  });
  return t;
}

const endpointOf = (device: string) => `https://fcm.googleapis.com/fcm/send/${device}`;
const subscription = (device: string) => ({
  endpoint: endpointOf(device),
  expirationTime: null,
  keys: { p256dh: `B${"B".repeat(86)}`, auth: "C".repeat(22) },
});

function expectError(res: { statusCode: number; json(): unknown }, status: number, code: string) {
  expect(res.statusCode).toBe(status);
  expect(errorResponseSchema.parse(res.json()).error.code).toBe(code);
}

let t: PushApp;
let cookieA: string;
let cookieB: string;
let cookieC: string;

beforeEach(async () => {
  t = await startPushApp();
  cookieA = await t.signIn(A);
  cookieB = await t.signIn(B);
  cookieC = await t.signIn(C);
  // A first request makes each account.
  for (const cookie of [cookieA, cookieB, cookieC]) {
    expect((await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).statusCode).toBe(200);
  }
});

afterEach(async () => {
  await t.close();
});

function subscribe(cookie: string, body: unknown, origin: string | undefined = t.origin) {
  return t.app.inject({
    method: "POST",
    url: "/api/push/subscriptions",
    headers: { cookie, ...(origin ? { origin } : {}) },
    payload: body as object,
  });
}

function unsubscribe(cookie: string, endpoint: string, origin: string | undefined = t.origin) {
  return t.app.inject({
    method: "DELETE",
    url: "/api/push/subscriptions",
    headers: { cookie, ...(origin ? { origin } : {}) },
    payload: { endpoint },
  });
}

async function direct(cookie: string, withSubject: string): Promise<string> {
  const res = await t.app.inject({
    method: "POST",
    url: "/api/conversations",
    headers: { cookie },
    payload: { kind: "direct", with: withSubject },
  });
  return routes.createConversation.response.parse(res.json()).conversation.id;
}

async function group(cookie: string, title: string, members: string[]): Promise<string> {
  const res = await t.app.inject({
    method: "POST",
    url: "/api/conversations",
    headers: { cookie },
    payload: { kind: "group", title, members },
  });
  return routes.createConversation.response.parse(res.json()).conversation.id;
}

function send(cookie: string, id: string, text: string, clientId: string = randomUUID()) {
  return t.app.inject({
    method: "POST",
    url: `/api/conversations/${id}/messages`,
    headers: { cookie },
    payload: { clientId, text },
  });
}

const endpoints = (subject: string) => t.store.listPushSubscriptions(subject).map((s) => s.endpoint);

describe("GET /api/push/key", () => {
  it("hands a signed-in member the VAPID public key", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/push/key", headers: { cookie: cookieB } });
    expect(res.statusCode).toBe(200);
    expect(routes.pushKey.response.parse(res.json())).toEqual({ publicKey: PUBLIC_KEY });
  });

  it("needs a Ward session", async () => {
    expectError(await t.app.inject({ method: "GET", url: "/api/push/key" }), 401, "unauthorized");
  });
});

describe("POST /api/push/subscriptions", () => {
  it("saves the browser's subscription for the caller: 201, then 200 for the same endpoint", async () => {
    const first = await subscribe(cookieB, subscription("phone-b"));
    expect(first.statusCode).toBe(201);
    expect(routes.savePushSubscription.response.parse(first.json())).toEqual({ ok: true });
    expect((await subscribe(cookieB, subscription("phone-b"))).statusCode).toBe(200);
    expect(t.store.listPushSubscriptions(B.subject)).toMatchObject([
      { endpoint: endpointOf("phone-b"), p256dh: subscription("phone-b").keys.p256dh, auth: "C".repeat(22) },
    ]);
  });

  it("binds an endpoint to whoever saved it last", async () => {
    await subscribe(cookieA, subscription("shared-laptop"));
    await subscribe(cookieB, subscription("shared-laptop"));
    expect(endpoints(A.subject)).toEqual([]);
    expect(endpoints(B.subject)).toEqual([endpointOf("shared-laptop")]);
  });

  it.each([
    ["an http endpoint", { ...subscription("x"), endpoint: "http://fcm.googleapis.com/fcm/send/x" }],
    ["an endpoint on a private address", { ...subscription("x"), endpoint: "https://127.0.0.1:8795/api/health" }],
    ["no keys", { endpoint: endpointOf("x") }],
    ["no body", undefined],
  ])("rejects %s with 400 and stores nothing", async (_label, body) => {
    expectError(await subscribe(cookieB, body), 400, "invalid_request");
    expect(endpoints(B.subject)).toEqual([]);
  });

  it("refuses a write from another origin, and needs a session", async () => {
    expectError(await subscribe(cookieB, subscription("x"), "https://evil.example"), 403, "forbidden");
    expectError(await subscribe("", subscription("x")), 401, "unauthorized");
    expect(endpoints(B.subject)).toEqual([]);
  });
});

describe("DELETE /api/push/subscriptions", () => {
  it("deletes only the caller's own, and answers 200 either way", async () => {
    await subscribe(cookieA, subscription("phone-a"));
    const other = await unsubscribe(cookieB, endpointOf("phone-a"));
    expect(other.statusCode).toBe(200);
    expect(endpoints(A.subject)).toEqual([endpointOf("phone-a")]);

    const own = await unsubscribe(cookieA, endpointOf("phone-a"));
    expect(own.statusCode).toBe(200);
    expect(routes.deletePushSubscription.response.parse(own.json())).toEqual({ ok: true });
    expect(endpoints(A.subject)).toEqual([]);
    expect((await unsubscribe(cookieA, endpointOf("phone-a"))).statusCode).toBe(200);
  });

  it("refuses a delete from another origin", async () => {
    await subscribe(cookieA, subscription("phone-a"));
    expectError(await unsubscribe(cookieA, endpointOf("phone-a"), "https://evil.example"), 403, "forbidden");
    expect(endpoints(A.subject)).toEqual([endpointOf("phone-a")]);
  });
});

describe("pushes for a stored message", () => {
  it("notifies the other member's devices, never the sender's", async () => {
    await subscribe(cookieA, subscription("phone-a"));
    await subscribe(cookieB, subscription("phone-b"));
    await subscribe(cookieB, subscription("laptop-b"));
    const chat = await direct(cookieA, B.subject);

    expect((await send(cookieA, chat, "Lunch at 1?")).statusCode).toBe(201);
    await t.settle();

    expect(t.sent.map((s) => s.endpoint).sort()).toEqual([endpointOf("laptop-b"), endpointOf("phone-b")]);
    for (const { payload } of t.sent) expect(payload).toEqual({ conversationId: chat, title: "ana", body: "Lunch at 1?" });
    expect(t.store.listPushSubscriptions(B.subject).every((s) => s.lastSuccessAt !== null)).toBe(true);
    expect(t.store.listPushSubscriptions(A.subject)[0]?.lastSuccessAt).toBeNull();
  });

  it('titles a group push "Sender in Group" and sends it to every other member', async () => {
    for (const [cookie, device] of [[cookieA, "a"], [cookieB, "b"], [cookieC, "c"]] as const) {
      await subscribe(cookie, subscription(device));
    }
    const hike = await group(cookieB, "Hike", [A.subject, C.subject]);

    await send(cookieB, hike, "x".repeat(200));
    await t.settle();

    expect(t.sent.map((s) => s.endpoint).sort()).toEqual([endpointOf("a"), endpointOf("c")]);
    expect(t.sent[0]?.payload).toEqual({ conversationId: hike, title: "bob in Hike", body: "x".repeat(120) });
  });

  it("sends nothing for a repeated client ID", async () => {
    await subscribe(cookieB, subscription("phone-b"));
    const chat = await direct(cookieA, B.subject);
    const clientId = randomUUID();
    expect((await send(cookieA, chat, "once", clientId)).statusCode).toBe(201);
    expect((await send(cookieA, chat, "once", clientId)).statusCode).toBe(200);
    await t.settle();
    expect(t.sent).toHaveLength(1);
  });

  it("sends nothing for the Ideas inbox", async () => {
    await subscribe(cookieA, subscription("phone-a"));
    const me = await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie: cookieA } });
    const inbox = routes.me.response.parse(me.json()).inboxId ?? "";
    expect((await send(cookieA, inbox, "an idea")).statusCode).toBe(201);
    await t.settle();
    expect(t.sent).toEqual([]);
  });

  it.each([404, 410])("deletes a subscription the push service answers %i for, and keeps the rest", async (status) => {
    await subscribe(cookieB, subscription("old-phone"));
    await subscribe(cookieB, subscription("new-phone"));
    t.respond = (target) =>
      target.endpoint === endpointOf("old-phone")
        ? Promise.reject(Object.assign(new Error("Received unexpected response code"), { statusCode: status }))
        : Promise.resolve();
    const chat = await direct(cookieA, B.subject);

    expect((await send(cookieA, chat, "hi")).statusCode).toBe(201);
    await t.settle();

    expect(endpoints(B.subject)).toEqual([endpointOf("new-phone")]);
  });

  it("keeps a subscription after any other failure, logs it without the endpoint, and never retries", async () => {
    await subscribe(cookieB, subscription("phone-b"));
    t.respond = () => Promise.reject(Object.assign(new Error("Received unexpected response code"), { statusCode: 500 }));
    const chat = await direct(cookieA, B.subject);

    expect((await send(cookieA, chat, "hi")).statusCode).toBe(201);
    await t.settle();

    expect(t.sent).toHaveLength(1);
    expect(endpoints(B.subject)).toEqual([endpointOf("phone-b")]);
    const warning = t.logs.find((line) => line.includes("push not delivered"));
    expect(warning).toBeDefined();
    expect(JSON.parse(warning ?? "{}")).toMatchObject({ statusCode: 500, pushService: "fcm.googleapis.com", subject: B.subject });
    expect(t.logs.join("\n")).not.toContain("phone-b");
  });

  it("answers 201 before the push service does, and whatever it says", async () => {
    await subscribe(cookieB, subscription("phone-b"));
    let fail!: (error: Error) => void;
    t.respond = () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      });
    const chat = await direct(cookieA, B.subject);

    const res = await send(cookieA, chat, "hi");
    expect(res.statusCode).toBe(201);
    expect(routes.sendMessage.response.parse(res.json()).message.text).toBe("hi");

    await vi.waitFor(() => expect(t.sent).toHaveLength(1));
    fail(new Error("socket hang up"));
    await t.settle();
    expect(t.logs.some((line) => line.includes("push not delivered") && line.includes("socket hang up"))).toBe(true);
  });

  it("still answers 201 when sending throws or the store lookup fails", async () => {
    await subscribe(cookieB, subscription("phone-b"));
    const chat = await direct(cookieA, B.subject);

    t.respond = () => {
      throw new Error("encryption blew up");
    };
    expect((await send(cookieA, chat, "one")).statusCode).toBe(201);
    await vi.waitFor(() => expect(t.sent).toHaveLength(1));

    vi.spyOn(t.store, "listPushSubscriptions").mockImplementation(() => {
      throw new Error("database is locked");
    });
    expect((await send(cookieA, chat, "two")).statusCode).toBe(201);
    await t.settle();

    expect(t.logs.some((line) => line.includes("encryption blew up"))).toBe(true);
    expect(t.logs.some((line) => line.includes("push notifications not sent") && line.includes("database is locked"))).toBe(
      true,
    );
  });
});

describe("an account that lost its Satchel grant", () => {
  const people = async (cookie: string) => {
    const res = await t.app.inject({ method: "GET", url: "/api/people", headers: { cookie } });
    return routes.listPeople.response.parse(res.json()).people.map((p) => p.subject);
  };
  const create = (cookie: string, payload: object) =>
    t.app.inject({ method: "POST", url: "/api/conversations", headers: { cookie }, payload });

  /** A fresh session for B without the grant (a fresh token, so no cached introspection), and one request. */
  async function loseGrant(): Promise<void> {
    const cookie = await t.signIn({ ...B, grants: { atrium: ["member"] } });
    expectError(await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie } }), 403, "forbidden");
  }

  it("is locked out at its next request: hidden, not addable, its devices forgotten, its chats kept", async () => {
    await subscribe(cookieB, subscription("phone-b"));
    await subscribe(cookieC, subscription("phone-c"));
    const chat = await direct(cookieA, B.subject);
    const hike = await group(cookieA, "Hike", [B.subject, C.subject]);
    expect(await people(cookieA)).toEqual([B.subject, C.subject]);

    await loseGrant();

    expect(t.store.isAccountActive(B.subject)).toBe(false);
    expect(endpoints(B.subject)).toEqual([]);
    expect(await people(cookieA)).toEqual([C.subject]);
    expect(await people(cookieC)).toEqual([A.subject]);

    for (const payload of [
      { kind: "direct", with: B.subject },
      { kind: "group", title: "Picnic", members: [B.subject, C.subject] },
    ]) {
      const res = await create(cookieA, payload);
      expectError(res, 400, "invalid_request");
      expect(errorResponseSchema.parse(res.json()).error.message).toBe("That person no longer has access to Satchel.");
    }
    // A friend of theirs can't add them either; nothing new was made.
    expectError(await create(cookieC, { kind: "direct", with: B.subject }), 400, "invalid_request");
    const friendChats = t.store.listConversations(A.subject).filter((c) => c.kind !== "inbox");
    expect(friendChats.map((c) => c.id).sort()).toEqual([chat, hike].sort());

    // The existing chats stay and still take messages; only C's phone hears about them.
    expect((await send(cookieA, chat, "you there?")).statusCode).toBe(201);
    expect((await send(cookieA, hike, "Saturday?")).statusCode).toBe(201);
    await t.settle();
    expect(t.sent.map((s) => s.endpoint)).toEqual([endpointOf("phone-c")]);
    expect(t.store.listMessages(chat).map((m) => m.text)).toEqual(["you there?"]);
  });

  it("gets no push even while its subscriptions are still stored", async () => {
    await subscribe(cookieB, subscription("phone-b"));
    await subscribe(cookieC, subscription("phone-c"));
    const hike = await group(cookieA, "Hike", [B.subject, C.subject]);
    // Inactive without the guard's cleanup, to test the push filter on its own.
    t.db.prepare("UPDATE accounts SET active = 0 WHERE subject = ?").run(B.subject);

    expect((await send(cookieA, hike, "Saturday?")).statusCode).toBe(201);
    await t.settle();

    expect(t.sent.map((s) => s.endpoint)).toEqual([endpointOf("phone-c")]);
    expect(endpoints(B.subject)).toEqual([endpointOf("phone-b")]);
  });

  it("is active and listed again once a grant comes back", async () => {
    await loseGrant();
    const regained = await t.signIn(B);
    expect((await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie: regained } })).statusCode).toBe(200);

    expect(t.store.isAccountActive(B.subject)).toBe(true);
    expect(await people(cookieA)).toEqual([B.subject, C.subject]);
    const made = await create(cookieA, { kind: "direct", with: B.subject });
    expect(made.statusCode).toBe(201);
    // Its browser saves its subscription again on the next start, and pushes resume.
    expect((await subscribe(regained, subscription("phone-b"))).statusCode).toBe(201);
    await send(cookieA, routes.createConversation.response.parse(made.json()).conversation.id, "welcome back");
    await t.settle();
    expect(t.sent.map((s) => s.endpoint)).toEqual([endpointOf("phone-b")]);
  });
});

describe("with push off", () => {
  let off: TestApp;

  beforeEach(async () => {
    off = await startTestApp();
  });

  afterEach(async () => {
    await off.close();
  });

  it("answers 404 for the key and for subscribing, but still lets a browser delete", async () => {
    const cookie = await off.signIn(A);
    expectError(await off.app.inject({ method: "GET", url: "/api/push/key", headers: { cookie } }), 404, "not_found");
    expectError(
      await off.app.inject({ method: "POST", url: "/api/push/subscriptions", headers: { cookie }, payload: subscription("x") }),
      404,
      "not_found",
    );
    const res = await off.app.inject({
      method: "DELETE",
      url: "/api/push/subscriptions",
      headers: { cookie },
      payload: { endpoint: endpointOf("x") },
    });
    expect(res.statusCode).toBe(200);
  });

  it("stores and answers a message as usual", async () => {
    const cookie = await off.signIn(A);
    const me = await off.app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
    const inbox = routes.me.response.parse(me.json()).inboxId ?? "";
    const res = await off.app.inject({
      method: "POST",
      url: `/api/conversations/${inbox}/messages`,
      headers: { cookie },
      payload: { clientId: randomUUID(), text: "idea" },
    });
    expect(res.statusCode).toBe(201);
  });
});

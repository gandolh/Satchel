import { randomBytes, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { connect as netConnect, type AddressInfo } from "node:net";
import {
  CLAUDE_MEMBER,
  LIVE_CLOSE_SESSION_EXPIRED,
  LIVE_PATH,
  createClaudeTokenResponseSchema,
  errorResponseSchema,
  liveEventSchema,
  meResponseSchema,
  routes,
  type LiveEvent,
} from "@satchel/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTestApp, type TestApp } from "../ward/testing/testApp.js";

/**
 * `GET /api/live` end to end: the real app listening on a port, the real Ward
 * client against the fake Ward, and Node's own WebSocket client sending the
 * Ward cookie and an `Origin`, the way a browser tab does.
 */

const A = { subject: "subject-a", username: "ana" };
const B = { subject: "subject-b", username: "bob", grants: { satchel: ["member"] } };
const C = { subject: "subject-c", username: "cora", grants: { satchel: ["member"] } };

let t: TestApp;
let clockOffsetMs: number;
let port: number;
const clients: LiveClient[] = [];

beforeEach(async () => {
  clockOffsetMs = 0;
  t = await startTestApp({ clock: () => new Date(Date.now() + clockOffsetMs) });
  await t.app.listen({ port: 0, host: "127.0.0.1" });
  port = (t.app.server.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.socket.close();
  await t.close();
});

// --- Helpers -------------------------------------------------------------------

interface LiveClient {
  socket: WebSocket;
  events: LiveEvent[];
  closed: Promise<{ code: number; reason: string }>;
}

/** Opens `/api/live` with the cookie and (by default) the app's own Origin, and collects every event. */
async function connect(cookie: string, origin: string = t.origin): Promise<LiveClient> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${LIVE_PATH}`, { headers: { cookie, origin } });
  const events: LiveEvent[] = [];
  socket.addEventListener("message", (event) => {
    events.push(liveEventSchema.parse(JSON.parse(String(event.data))));
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    socket.addEventListener("close", (event) => resolve({ code: event.code, reason: event.reason }));
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("the socket did not open")), { once: true });
  });
  const client = { socket, events, closed };
  clients.push(client);
  return client;
}

async function waitFor(check: () => boolean, what: string, timeoutMs = 2000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function within<T>(promise: Promise<T>, timeoutMs: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error(`timed out: ${what}`)), timeoutMs)),
  ]);
}

/** A raw upgrade request: the status and body the server answered with, or 101 when it upgraded. */
function upgrade(headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: "127.0.0.1",
      port,
      path: LIVE_PATH,
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-version": "13",
        "sec-websocket-key": randomBytes(16).toString("base64"),
        ...headers,
      },
    });
    req.on("response", (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("upgrade", (_res, socket) => {
      socket.destroy();
      resolve({ status: 101, body: "" });
    });
    req.on("error", reject);
    req.end();
  });
}

function errorCode(body: string): string {
  return errorResponseSchema.parse(JSON.parse(body)).error.code;
}

/** Signs in and calls `/api/me`, which makes the account (and the owner's inbox). */
async function signIn(who: typeof A | typeof B): Promise<{ cookie: string; inboxId: string | null }> {
  const cookie = await t.signIn(who);
  const res = await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
  expect(res.statusCode).toBe(200);
  return { cookie, inboxId: meResponseSchema.parse(res.json()).inboxId };
}

async function send(cookie: string, conversationId: string, text: string, clientId: string = randomUUID()) {
  const res = await t.app.inject({
    method: "POST",
    url: `/api/conversations/${conversationId}/messages`,
    headers: { cookie },
    payload: { clientId, text },
  });
  expect([200, 201]).toContain(res.statusCode);
  return routes.sendMessage.response.parse(res.json()).message;
}

async function createDirect(cookie: string, withSubject: string) {
  const res = await t.app.inject({
    method: "POST",
    url: "/api/conversations",
    headers: { cookie },
    payload: { kind: "direct", with: withSubject },
  });
  expect([200, 201]).toContain(res.statusCode);
  return { status: res.statusCode, conversation: routes.createConversation.response.parse(res.json()).conversation };
}

const ofType = <T extends LiveEvent["type"]>(events: LiveEvent[], type: T) =>
  events.filter((event): event is Extract<LiveEvent, { type: T }> => event.type === type);

// --- Who gets what -------------------------------------------------------------

describe("events reach the members' sockets and nobody else's", () => {
  it("a message in A's inbox reaches both of A's sockets and none of B's", async () => {
    const a = await signIn(A);
    const b = await signIn(B);
    const [a1, a2, b1] = [await connect(a.cookie), await connect(a.cookie), await connect(b.cookie)];

    const message = await send(a.cookie, a.inboxId!, "an idea");
    await waitFor(() => a1.events.length === 1 && a2.events.length === 1, "A's two sockets");
    for (const client of [a1, a2]) {
      expect(client.events).toEqual([{ type: "message", conversationId: a.inboxId, message }]);
    }

    // Events leave in order on each socket, so once B has the next one, it
    // would already have had the inbox message.
    const { conversation } = await createDirect(a.cookie, B.subject);
    await waitFor(() => b1.events.length >= 1, "B's conversation event");
    expect(b1.events).toEqual([{ type: "conversation", conversation: expect.objectContaining({ id: conversation.id }) }]);
  });

  it("a message in an A–B chat reaches all three sockets, the sender's own included", async () => {
    const a = await signIn(A);
    const b = await signIn(B);
    const { conversation } = await createDirect(a.cookie, B.subject);
    const [a1, a2, b1] = [await connect(a.cookie), await connect(a.cookie), await connect(b.cookie)];

    const message = await send(b.cookie, conversation.id, "hi ana");
    await waitFor(() => [a1, a2, b1].every((c) => c.events.length === 1), "all three sockets");
    for (const client of [a1, a2, b1]) {
      expect(client.events).toEqual([{ type: "message", conversationId: conversation.id, message }]);
    }
  });

  it("a repeated client ID publishes nothing the second time", async () => {
    const a = await signIn(A);
    const a1 = await connect(a.cookie);
    const clientId = randomUUID();
    await send(a.cookie, a.inboxId!, "once", clientId);
    await send(a.cookie, a.inboxId!, "once", clientId);
    const next = await send(a.cookie, a.inboxId!, "next");
    await waitFor(() => a1.events.length >= 2, "the next message");
    expect(ofType(a1.events, "message").map((e) => e.message.text)).toEqual(["once", "next"]);
    expect(a1.events.at(-1)).toMatchObject({ message: { seq: next.seq } });
  });

  it("/claude/seen reaches A's sockets as Claude's marker, and nobody else's", async () => {
    const a = await signIn(A);
    const b = await signIn(B);
    const tokenRes = await t.app.inject({ method: "POST", url: "/api/claude-tokens", headers: { cookie: a.cookie } });
    const { token } = createClaudeTokenResponseSchema.parse(tokenRes.json());
    const message = await send(a.cookie, a.inboxId!, "for claude");
    const [a1, a2, b1] = [await connect(a.cookie), await connect(a.cookie), await connect(b.cookie)];

    const seen = await t.app.inject({
      method: "POST",
      url: "/claude/seen",
      headers: { authorization: `Bearer ${token}` },
      payload: { upTo: message.seq },
    });
    expect(seen.statusCode).toBe(200);
    await waitFor(() => a1.events.length === 1 && a2.events.length === 1, "A's sockets");
    for (const client of [a1, a2]) {
      expect(client.events).toEqual([
        { type: "seen", conversationId: a.inboxId, member: CLAUDE_MEMBER, seenUpTo: message.seq, seenAt: expect.any(String) },
      ]);
    }

    // The same upTo again moves nothing and publishes nothing.
    await t.app.inject({
      method: "POST",
      url: "/claude/seen",
      headers: { authorization: `Bearer ${token}` },
      payload: { upTo: message.seq },
    });
    await createDirect(a.cookie, B.subject);
    await waitFor(() => b1.events.length >= 1 && a1.events.length >= 2, "the conversation events");
    expect(ofType(a1.events, "seen")).toHaveLength(1);
    expect(b1.events.map((e) => e.type)).toEqual(["conversation"]);
  });

  it("seen from the web reaches every member of the chat", async () => {
    const a = await signIn(A);
    const b = await signIn(B);
    const { conversation } = await createDirect(a.cookie, B.subject);
    const message = await send(a.cookie, conversation.id, "read me");
    const [a1, b1] = [await connect(a.cookie), await connect(b.cookie)];

    const res = await t.app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/seen`,
      headers: { cookie: b.cookie },
      payload: { upTo: message.seq },
    });
    expect(res.statusCode).toBe(200);
    await waitFor(() => a1.events.length === 1 && b1.events.length === 1, "both sockets");
    for (const client of [a1, b1]) {
      expect(client.events).toEqual([
        { type: "seen", conversationId: conversation.id, member: B.subject, seenUpTo: message.seq, seenAt: expect.any(String) },
      ]);
    }
  });

  it("a new conversation goes to each member as they see it; an existing direct one goes nowhere", async () => {
    const a = await signIn(A);
    const b = await signIn(B);
    await signIn(C);
    const [a1, b1] = [await connect(a.cookie), await connect(b.cookie)];

    const group = await t.app.inject({
      method: "POST",
      url: "/api/conversations",
      headers: { cookie: a.cookie },
      payload: { kind: "group", title: "Hike", members: [B.subject, C.subject] },
    });
    expect(group.statusCode).toBe(201);
    const groupId = routes.createConversation.response.parse(group.json()).conversation.id;
    await waitFor(() => a1.events.length === 1 && b1.events.length === 1, "the group events");
    for (const client of [a1, b1]) {
      const [event] = ofType(client.events, "conversation");
      expect(event?.conversation).toMatchObject({ id: groupId, kind: "group", title: "Hike", unreadCount: 0 });
      expect(event?.conversation.members.map((m) => m.id)).toEqual([A.subject, B.subject, C.subject]);
    }

    const first = await createDirect(b.cookie, A.subject);
    expect(first.status).toBe(201);
    await waitFor(() => a1.events.length === 2 && b1.events.length === 2, "the direct events");
    const again = await createDirect(a.cookie, B.subject);
    expect(again.status).toBe(200);
    const message = await send(a.cookie, first.conversation.id, "barrier");
    await waitFor(() => b1.events.length === 3, "the barrier message");
    expect(b1.events.map((e) => e.type)).toEqual(["conversation", "conversation", "message"]);
    expect(b1.events[2]).toMatchObject({ message: { seq: message.seq } });
  });
});

// --- The session ---------------------------------------------------------------

describe("the socket and the Ward session", () => {
  it("closes with 4001 when the access token it opened with expires", async () => {
    const { cookie } = await signIn(A);
    const payload = JSON.parse(Buffer.from(cookie.split(".")[1]!, "base64url").toString("utf8")) as { exp: number };
    // The app's clock says the token has 300 ms left; Ward's own checks still use the real time.
    clockOffsetMs = payload.exp * 1000 - Date.now() - 300;

    const a1 = await connect(cookie);
    expect(a1.socket.readyState).toBe(WebSocket.OPEN);
    const closed = await within(a1.closed, 3000, "the 4001 close");
    expect(closed.code).toBe(LIVE_CLOSE_SESSION_EXPIRED);
  });

  it("stays open well before the token expires", async () => {
    const { cookie } = await signIn(A);
    const a1 = await connect(cookie);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(a1.socket.readyState).toBe(WebSocket.OPEN);
  });

  it("no Claude token can open it", async () => {
    const a = await signIn(A);
    const tokenRes = await t.app.inject({ method: "POST", url: "/api/claude-tokens", headers: { cookie: a.cookie } });
    const { token } = createClaudeTokenResponseSchema.parse(tokenRes.json());

    const res = await upgrade({ origin: t.origin, authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
    expect(errorCode(res.body)).toBe("unauthorized");
  });

  it("no cookie is 401, and a Ward account without a Satchel grant is 403", async () => {
    const none = await upgrade({ origin: t.origin });
    expect(none.status).toBe(401);
    expect(errorCode(none.body)).toBe("unauthorized");

    const stranger = await t.signIn({ subject: "subject-x", username: "xena", grants: {} });
    const refused = await upgrade({ origin: t.origin, cookie: stranger });
    expect(refused.status).toBe(403);
    expect(errorCode(refused.body)).toBe("forbidden");
  });

  it("upgrades with the cookie and the app's own Origin", async () => {
    const { cookie } = await signIn(A);
    expect((await upgrade({ origin: t.origin, cookie })).status).toBe(101);
  });

  it("refuses an upgrade from another origin, or with none, before Ward is asked", async () => {
    const { cookie } = await signIn(A);
    const before = t.fakeWard.introspectCallCount;
    const refused: Record<string, string>[] = [
      { cookie, origin: "https://evil.example" },
      { cookie, origin: "null" },
      { cookie, origin: t.origin.replace("127.0.0.1", "localhost") },
      { cookie },
    ];
    for (const headers of refused) {
      const res = await upgrade(headers);
      expect(res.status).toBe(403);
      expect(errorCode(res.body)).toBe("forbidden");
    }
    expect(t.fakeWard.introspectCallCount).toBe(before);

    // And the browser client gets no socket either.
    await expect(connect(cookie, "https://evil.example")).rejects.toThrow("did not open");
  });

  it("a refused upgrade gets its answer and then its connection is closed", async () => {
    // A hook that answers first skips @fastify/websocket's own cleanup; without
    // ours the socket would stay open after the error, holding up app.close().
    for (const headers of [`Origin: https://evil.example`, `Origin: ${t.origin}`]) {
      const raw = await new Promise<string>((resolve, reject) => {
        const socket = netConnect(port, "127.0.0.1", () => {
          socket.write(
            `GET ${LIVE_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n` +
              `Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString("base64")}\r\n${headers}\r\n\r\n`,
          );
        });
        let received = "";
        socket.setEncoding("utf8");
        socket.on("data", (chunk: string) => (received += chunk));
        socket.on("close", () => resolve(received));
        socket.on("error", reject);
      });
      expect(raw).toMatch(/^HTTP\/1\.1 40[13] /);
      expect(raw.toLowerCase()).toContain("connection: close");
    }
  });

  it("a plain GET is a 400 behind the guard", async () => {
    const { cookie } = await signIn(A);
    const signedIn = await t.app.inject({ method: "GET", url: LIVE_PATH, headers: { cookie } });
    expect(signedIn.statusCode).toBe(400);
    expect(errorCode(signedIn.body)).toBe("invalid_request");
    const signedOut = await t.app.inject({ method: "GET", url: LIVE_PATH });
    expect(signedOut.statusCode).toBe(401);
  });
});

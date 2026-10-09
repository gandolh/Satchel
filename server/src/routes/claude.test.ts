import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  CLAUDE_MEMBER,
  PAGE_LIMIT_MAX,
  claudeMessagesResponseSchema,
  claudeUnreadResponseSchema,
  createClaudeTokenResponseSchema,
  errorResponseSchema,
  meResponseSchema,
  seenResponseSchema,
} from "@satchel/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTestApp, type TestApp } from "../ward/testing/testApp.js";

const A = { subject: "subject-a", username: "ana" };
const B = { subject: "subject-b", username: "bogdan" };

const UNAUTHORIZED_MESSAGE =
  "Unknown or revoked Claude token. Create a new one in Satchel under Settings → Connect Claude.";

let t: TestApp;
let now: Date;

beforeEach(async () => {
  now = new Date("2026-10-09T08:00:00.000Z");
  t = await startTestApp({ captureLogs: true, clock: () => now });
});

afterEach(async () => {
  await t.close();
});

interface Owner {
  subject: string;
  cookie: string;
  inboxId: string;
}

/** Signs in and calls `/api/me`, which creates the account and its inbox. */
async function owner(who: { subject: string; username: string }): Promise<Owner> {
  const cookie = await t.signIn(who);
  const res = await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
  expect(res.statusCode).toBe(200);
  const { inboxId } = meResponseSchema.parse(res.json());
  if (inboxId === null) throw new Error(`${who.username} has no inbox; sign in as an owner`);
  return { subject: who.subject, cookie, inboxId };
}

async function createToken({ cookie }: Owner): Promise<{ id: string; token: string }> {
  const res = await t.app.inject({ method: "POST", url: "/api/claude-tokens", headers: { cookie } });
  expect(res.statusCode).toBe(201);
  return createClaudeTokenResponseSchema.parse(res.json());
}

/** The owner writes to their inbox. Returns the stored seq. */
function post({ subject, inboxId }: Owner, text: string): number {
  return t.store.appendMessage({ conversationId: inboxId, sender: subject, clientId: randomUUID(), text }).message.seq;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function unread(token: string) {
  const res = await t.app.inject({ method: "GET", url: "/claude/unread", headers: bearer(token) });
  expect(res.statusCode).toBe(200);
  return claudeUnreadResponseSchema.parse(res.json());
}

async function seen(token: string, upTo: number) {
  const res = await t.app.inject({ method: "POST", url: "/claude/seen", headers: bearer(token), payload: { upTo } });
  expect(res.statusCode).toBe(200);
  return seenResponseSchema.parse(res.json()).seenUpTo;
}

async function history(token: string, query = "") {
  const res = await t.app.inject({ method: "GET", url: `/claude/messages${query}`, headers: bearer(token) });
  expect(res.statusCode).toBe(200);
  return claudeMessagesResponseSchema.parse(res.json()).messages;
}

function expectError(res: { statusCode: number; json(): unknown }, status: number, code: string): string {
  expect(res.statusCode).toBe(status);
  const body = errorResponseSchema.parse(res.json());
  expect(body.error.code).toBe(code);
  return body.error.message;
}

function expectUnauthorized(res: { statusCode: number; headers: Record<string, unknown>; json(): unknown }) {
  expect(expectError(res, 401, "unauthorized")).toBe(UNAUTHORIZED_MESSAGE);
  expect(res.headers["www-authenticate"]).toBe("Bearer");
}

describe("GET /claude/unread and POST /claude/seen", () => {
  it("returns the inbox's messages oldest first, then nothing once they are seen", async () => {
    const a = await owner(A);
    const { token } = await createToken(a);
    const seqs = [post(a, "warmup timer"), post(a, "per exercise"), post(a, "not one long timer")];

    const first = await unread(token);
    expect(first.seenUpTo).toBe(0);
    expect(first.messages.map((m) => m.seq)).toEqual(seqs);
    expect(first.messages.map((m) => m.text)).toEqual(["warmup timer", "per exercise", "not one long timer"]);
    expect(first.messages[0]).toEqual({ seq: seqs[0], sentAt: now.toISOString(), text: "warmup timer" });

    expect(await seen(token, seqs[2] ?? -1)).toBe(seqs[2]);
    expect(await unread(token)).toEqual({ seenUpTo: seqs[2], messages: [] });
  });

  it("reading changes nothing", async () => {
    const a = await owner(A);
    const { token } = await createToken(a);
    post(a, "one");
    post(a, "two");

    const first = await unread(token);
    expect(await unread(token)).toEqual(first);
    expect(t.store.seenUpTo(a.inboxId, CLAUDE_MEMBER)).toBe(0);
  });

  it("the race: a message sent between unread and seen comes back next time", async () => {
    const a = await owner(A);
    const { token } = await createToken(a);
    const read = [post(a, "#1"), post(a, "#2"), post(a, "#3"), post(a, "#4")];

    expect((await unread(token)).messages.map((m) => m.seq)).toEqual(read);
    const late = post(a, "#5");
    expect(await seen(token, read[3] ?? -1)).toBe(read[3]);

    const next = await unread(token);
    expect(next.seenUpTo).toBe(read[3]);
    expect(next.messages).toEqual([{ seq: late, sentAt: now.toISOString(), text: "#5" }]);
  });

  it("seen is forward only and clamped to the inbox's latest message", async () => {
    const a = await owner(A);
    const { token } = await createToken(a);
    const seqs = [post(a, "one"), post(a, "two"), post(a, "three")];

    expect(await seen(token, 999)).toBe(seqs[2]);
    expect(await seen(token, seqs[0] ?? -1)).toBe(seqs[2]);
    expect(await seen(token, 0)).toBe(seqs[2]);
  });

  it("seen with no body or a bad upTo is 400 invalid_request and moves nothing", async () => {
    const a = await owner(A);
    const { token } = await createToken(a);
    post(a, "one");

    const empty = await t.app.inject({
      method: "POST",
      url: "/claude/seen",
      headers: { ...bearer(token), "content-type": "application/json" },
    });
    expectError(empty, 400, "invalid_request");
    for (const upTo of [-1, 1.5, "3"]) {
      const res = await t.app.inject({ method: "POST", url: "/claude/seen", headers: bearer(token), payload: { upTo } });
      expectError(res, 400, "invalid_request");
    }
    expect(t.store.seenUpTo(a.inboxId, CLAUDE_MEMBER)).toBe(0);
  });
});

describe("GET /claude/messages", () => {
  it("every inbox message in seq order, seen up to Claude's marker", async () => {
    const a = await owner(A);
    const { token } = await createToken(a);
    const seqs = [post(a, "one"), post(a, "two"), post(a, "three")];
    await seen(token, seqs[1] ?? -1);

    expect(await history(token)).toEqual([
      { seq: seqs[0], sentAt: now.toISOString(), text: "one", seen: true },
      { seq: seqs[1], sentAt: now.toISOString(), text: "two", seen: true },
      { seq: seqs[2], sentAt: now.toISOString(), text: "three", seen: false },
    ]);
  });

  it("after and limit page through the inbox", async () => {
    const a = await owner(A);
    const { token } = await createToken(a);
    const seqs = [post(a, "1"), post(a, "2"), post(a, "3"), post(a, "4"), post(a, "5")];

    const page = await history(token, `?after=${seqs[1]}&limit=2`);
    expect(page.map((m) => m.seq)).toEqual([seqs[2], seqs[3]]);
  });

  it("since filters on sentAt", async () => {
    const a = await owner(A);
    const { token } = await createToken(a);
    now = new Date("2026-10-07T22:00:00.000Z");
    post(a, "old");
    now = new Date("2026-10-08T21:30:00.000Z");
    post(a, "evening");
    now = new Date("2026-10-09T08:12:00.000Z");
    post(a, "morning");

    expect((await history(token, "?since=2026-10-08")).map((m) => m.text)).toEqual(["evening", "morning"]);
    // 2026-10-09T00:30+03:00 is 2026-10-08T21:30Z: inclusive.
    expect((await history(token, "?since=2026-10-09T00:30:00%2B03:00")).map((m) => m.text)).toEqual([
      "evening",
      "morning",
    ]);
    expect((await history(token, "?since=2026-10-09")).map((m) => m.text)).toEqual(["morning"]);
  });

  it("a limit above the maximum or a bad since is 400 invalid_request", async () => {
    const a = await owner(A);
    const { token } = await createToken(a);

    for (const query of [`?limit=${PAGE_LIMIT_MAX + 1}`, "?limit=0", "?after=-1", "?since=last%20week"]) {
      const res = await t.app.inject({ method: "GET", url: `/claude/messages${query}`, headers: bearer(token) });
      expectError(res, 400, "invalid_request");
    }
  });
});

describe("a Claude token reaches its own inbox and nothing else", () => {
  it("B's inbox messages never appear for A's token, and A's seen never moves B's markers", async () => {
    const a = await owner(A);
    const b = await owner(B);
    const { token } = await createToken(a);
    const { token: tokenB } = await createToken(b);

    // Interleaved, so A's seqs have gaps where B's messages sit.
    const aSeqs = [post(a, "a-1"), post(a, "a-2")];
    post(b, "b-secret-1");
    aSeqs.push(post(a, "a-3"));
    const bLatest = post(b, "b-secret-2");

    const responses: string[] = [];
    const capture = async (method: "GET" | "POST", url: string, payload?: object) => {
      const res = await t.app.inject({ method, url, headers: bearer(token), ...(payload ? { payload } : {}) });
      expect(res.statusCode).toBe(200);
      responses.push(res.body);
      return res.json() as unknown;
    };

    const u = claudeUnreadResponseSchema.parse(await capture("GET", "/claude/unread"));
    expect(u.messages.map((m) => m.seq)).toEqual(aSeqs);

    const all = claudeMessagesResponseSchema.parse(await capture("GET", "/claude/messages?after=0"));
    expect(all.messages.map((m) => m.text)).toEqual(["a-1", "a-2", "a-3"]);

    // A conversation id in the query is not something these routes read.
    const steered = claudeMessagesResponseSchema.parse(
      await capture("GET", `/claude/messages?after=0&id=${b.inboxId}&conversationId=${b.inboxId}`),
    );
    expect(steered.messages.map((m) => m.text)).toEqual(["a-1", "a-2", "a-3"]);
    const steeredUnread = claudeUnreadResponseSchema.parse(
      await capture("GET", `/claude/unread?conversationId=${b.inboxId}`),
    );
    expect(steeredUnread.messages.map((m) => m.seq)).toEqual(aSeqs);

    // Clamped to A's inbox, which ends below B's latest seq.
    const marked = seenResponseSchema.parse(
      await capture("POST", "/claude/seen", { upTo: bLatest + 10, conversationId: b.inboxId }),
    );
    expect(marked.seenUpTo).toBe(aSeqs[2]);
    expect(t.store.seenUpTo(b.inboxId, CLAUDE_MEMBER)).toBe(0);
    expect(t.store.seenUpTo(b.inboxId, B.subject)).toBe(bLatest);

    for (const body of responses) {
      expect(body).not.toContain("b-secret");
      expect(body).not.toContain(b.inboxId);
      expect(body).not.toContain(B.subject);
    }

    // And B's token sees B's inbox only.
    expect((await unread(tokenB)).messages.map((m) => m.text)).toEqual(["b-secret-1", "b-secret-2"]);
  });
});

describe("friend conversations are never reachable with a Claude token", () => {
  it("A's token returns nothing from A's direct or group chat on any /claude/* route", async () => {
    const C = { subject: "subject-c", username: "cora" };
    const a = await owner(A);
    const { token } = await createToken(a);
    const friendB = await t.signIn({ ...B, grants: { satchel: ["member"] } });
    const friendC = await t.signIn({ ...C, grants: { satchel: ["member"] } });
    for (const cookie of [friendB, friendC]) {
      expect((await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).statusCode).toBe(200);
    }

    const start = async (cookie: string, payload: object) => {
      const res = await t.app.inject({ method: "POST", url: "/api/conversations", headers: { cookie }, payload });
      expect(res.statusCode).toBe(201);
      return (res.json() as { conversation: { id: string } }).conversation.id;
    };
    const direct = await start(a.cookie, { kind: "direct", with: B.subject });
    const group = await start(a.cookie, { kind: "group", title: "group-secret-title", members: [B.subject, C.subject] });
    const say = (conversationId: string, sender: string, text: string) =>
      t.store.appendMessage({ conversationId, sender, clientId: randomUUID(), text }).message.seq;

    // The owner and friends write in the friend chats, between and after the owner's inbox messages.
    const inboxSeqs = [post(a, "inbox-1")];
    say(direct, A.subject, "friend-secret-direct-from-a");
    say(direct, B.subject, "friend-secret-direct-from-b");
    inboxSeqs.push(post(a, "inbox-2"));
    say(group, A.subject, "friend-secret-group-from-a");
    say(group, C.subject, "friend-secret-group-from-c");
    const groupLatest = say(group, B.subject, "friend-secret-group-from-b");
    const markersBefore = t.db.prepare("SELECT * FROM members WHERE conversation_id IN (?, ?)").all(direct, group);

    const responses: string[] = [];
    const capture = async (method: "GET" | "POST", url: string, payload?: object) => {
      const res = await t.app.inject({ method, url, headers: bearer(token), ...(payload ? { payload } : {}) });
      expect(res.statusCode).toBe(200);
      responses.push(res.body);
      return res.json() as unknown;
    };

    for (const id of [direct, group]) {
      const steer = `id=${id}&conversationId=${id}`;
      const u = claudeUnreadResponseSchema.parse(await capture("GET", `/claude/unread?${steer}`));
      expect(u.messages.map((m) => m.seq)).toEqual(inboxSeqs);
      const all = claudeMessagesResponseSchema.parse(await capture("GET", `/claude/messages?after=0&${steer}`));
      expect(all.messages.map((m) => m.text)).toEqual(["inbox-1", "inbox-2"]);
      const since = claudeMessagesResponseSchema.parse(await capture("GET", `/claude/messages?since=2026-10-01&${steer}`));
      expect(since.messages.map((m) => m.text)).toEqual(["inbox-1", "inbox-2"]);
    }
    // Clamped to the inbox, which ends below the group's latest seq.
    for (const id of [direct, group]) {
      const marked = seenResponseSchema.parse(
        await capture("POST", "/claude/seen", { upTo: groupLatest + 10, conversationId: id, id }),
      );
      expect(marked.seenUpTo).toBe(inboxSeqs[1]);
    }
    expect(claudeUnreadResponseSchema.parse(await capture("GET", "/claude/unread"))).toEqual({
      seenUpTo: inboxSeqs[1],
      messages: [],
    });

    for (const body of responses) {
      expect(body).not.toContain("friend-secret");
      expect(body).not.toContain("group-secret-title");
      expect(body).not.toContain(direct);
      expect(body).not.toContain(group);
      expect(body).not.toContain(B.subject);
      expect(body).not.toContain(C.subject);
    }
    // Claude is not a member of either chat, and no marker in them moved.
    expect(t.db.prepare("SELECT * FROM members WHERE conversation_id IN (?, ?)").all(direct, group)).toEqual(markersBefore);
    expect(
      t.db
        .prepare<[string, string, string], { n: number }>(
          "SELECT COUNT(*) AS n FROM members WHERE conversation_id IN (?, ?) AND member = ?",
        )
        .get(direct, group, CLAUDE_MEMBER)?.n,
    ).toBe(0);
  });
});

describe("401 unauthorized", () => {
  const claudeRequests = [
    { method: "GET", url: "/claude/unread" },
    { method: "POST", url: "/claude/seen", payload: { upTo: 1 } },
    { method: "GET", url: "/claude/messages" },
  ] as const;

  it("a missing or malformed Authorization header, on every Claude route", async () => {
    const a = await owner(A);
    const { token } = await createToken(a);
    const malformed = [
      undefined,
      "",
      token,
      `Basic ${token}`,
      "Bearer",
      "Bearer ",
      `Bearer ${token} extra`,
      `Token ${token}`,
    ];

    for (const request of claudeRequests) {
      for (const authorization of malformed) {
        const res = await t.app.inject({
          ...request,
          headers: authorization === undefined ? {} : { authorization },
        });
        expectUnauthorized(res);
      }
    }
  });

  it("the scheme is case-insensitive", async () => {
    const a = await owner(A);
    const { token } = await createToken(a);
    const res = await t.app.inject({ method: "GET", url: "/claude/unread", headers: { authorization: `bearer ${token}` } });
    expect(res.statusCode).toBe(200);
  });

  it("an unknown token", async () => {
    await owner(A);
    const unknown = `stl_${randomBytes(32).toString("base64url")}`;
    for (const request of claudeRequests) {
      expectUnauthorized(await t.app.inject({ ...request, headers: bearer(unknown) }));
    }
  });

  it("a revoked token", async () => {
    const a = await owner(A);
    const { id, token } = await createToken(a);
    post(a, "one");
    expect((await unread(token)).messages).toHaveLength(1);

    const revoke = await t.app.inject({ method: "POST", url: `/api/claude-tokens/${id}/revoke`, headers: { cookie: a.cookie } });
    expect(revoke.statusCode).toBe(200);

    for (const request of claudeRequests) {
      expectUnauthorized(await t.app.inject({ ...request, headers: bearer(token) }));
    }
    expect(t.store.seenUpTo(a.inboxId, CLAUDE_MEMBER)).toBe(0);
  });

  it("a Ward cookie alone, without asking Ward", async () => {
    const a = await owner(A);
    await createToken(a);
    const before = t.fakeWard.introspectCallCount;

    for (const request of claudeRequests) {
      expectUnauthorized(await t.app.inject({ ...request, headers: { cookie: a.cookie } }));
    }
    expect(t.fakeWard.introspectCallCount).toBe(before);
  });

  it("is answered before the body is parsed", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/claude/seen",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expectUnauthorized(res);
  });

  it("A's Claude token is not a Ward session on /api/*", async () => {
    const a = await owner(A);
    const { token } = await createToken(a);

    for (const url of ["/api/conversations", "/api/me", "/api/claude-tokens"]) {
      expectError(await t.app.inject({ method: "GET", url, headers: bearer(token) }), 401, "unauthorized");
    }
  });
});

describe("logging", () => {
  it("never writes a Claude token or its hash", async () => {
    const a = await owner(A);
    const { id, token } = await createToken(a);
    const unknown = `stl_${randomBytes(32).toString("base64url")}`;
    const seq = post(a, "one");

    await unread(token);
    await seen(token, seq);
    await history(token);
    await t.app.inject({ method: "GET", url: "/claude/unread", headers: bearer(unknown) });
    await t.app.inject({ method: "GET", url: "/claude/unread", headers: { authorization: `Basic ${token}` } });
    await t.app.inject({ method: "POST", url: `/api/claude-tokens/${id}/revoke`, headers: { cookie: a.cookie } });
    await t.app.inject({ method: "GET", url: "/claude/unread", headers: bearer(token) });

    const output = t.logs.join("\n");
    expect(t.logs.length).toBeGreaterThan(0);
    expect(output).not.toContain(token);
    expect(output).not.toContain(token.slice("stl_".length));
    expect(output).not.toContain(unknown);
    expect(output).not.toContain(createHash("sha256").update(token).digest("hex"));
  });
});

import { createHash } from "node:crypto";
import {
  claudeTokensResponseSchema,
  createClaudeTokenResponseSchema,
  errorResponseSchema,
  revokeClaudeTokenResponseSchema,
} from "@satchel/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTestApp, type TestApp } from "../ward/testing/testApp.js";

const A = { subject: "subject-a", username: "ana" };
const B = { subject: "subject-b", username: "bogdan" };

let t: TestApp;
let now: Date;
let cookieA: string;
let cookieB: string;

beforeEach(async () => {
  now = new Date("2026-10-09T08:00:00.000Z");
  t = await startTestApp({ captureLogs: true, clock: () => now });
  cookieA = await t.signIn(A);
  cookieB = await t.signIn(B);
});

afterEach(async () => {
  await t.close();
});

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function create(cookie: string) {
  const res = await t.app.inject({ method: "POST", url: "/api/claude-tokens", headers: { cookie } });
  expect(res.statusCode).toBe(201);
  return createClaudeTokenResponseSchema.parse(res.json());
}

async function list(cookie: string) {
  const res = await t.app.inject({ method: "GET", url: "/api/claude-tokens", headers: { cookie } });
  expect(res.statusCode).toBe(200);
  return { body: res.body, tokens: claudeTokensResponseSchema.parse(res.json()).tokens };
}

function revoke(cookie: string, id: string) {
  return t.app.inject({ method: "POST", url: `/api/claude-tokens/${id}/revoke`, headers: { cookie } });
}

function useToken(token: string) {
  return t.app.inject({ method: "GET", url: "/claude/unread", headers: { authorization: `Bearer ${token}` } });
}

function expectError(res: { statusCode: number; json(): unknown }, status: number, code: string) {
  expect(res.statusCode).toBe(status);
  expect(errorResponseSchema.parse(res.json()).error.code).toBe(code);
}

describe("POST /api/claude-tokens", () => {
  it("answers 201 with the token once, marked no-store, and the token opens the inbox", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/claude-tokens", headers: { cookie: cookieA } });

    expect(res.statusCode).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    const body = createClaudeTokenResponseSchema.parse(res.json());
    expect(Object.keys(res.json() as object).sort()).toEqual(["createdAt", "id", "token"]);
    expect(body.token).toMatch(/^stl_[A-Za-z0-9_-]{43}$/);
    expect(body.createdAt).toBe(now.toISOString());

    expect((await useToken(body.token)).statusCode).toBe(200);
  });

  it("takes no body, and an empty JSON body is fine", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/claude-tokens",
      headers: { cookie: cookieA, "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("a second token leaves the first one working", async () => {
    const first = await create(cookieA);
    const second = await create(cookieA);

    expect(second.token).not.toBe(first.token);
    expect((await useToken(first.token)).statusCode).toBe(200);
    expect((await useToken(second.token)).statusCode).toBe(200);
  });
});

describe("GET /api/claude-tokens", () => {
  it("the caller's tokens newest first, never the token or its hash", async () => {
    const first = await create(cookieA);
    now = new Date("2026-10-09T08:05:00.000Z");
    const second = await create(cookieA);

    const { body, tokens } = await list(cookieA);
    expect(tokens).toEqual([
      { id: second.id, createdAt: "2026-10-09T08:05:00.000Z", lastUsedAt: null, revokedAt: null },
      { id: first.id, createdAt: "2026-10-09T08:00:00.000Z", lastUsedAt: null, revokedAt: null },
    ]);
    for (const { token } of [first, second]) {
      expect(body).not.toContain(token);
      expect(body).not.toContain(token.slice("stl_".length));
      expect(body).not.toContain(sha256(token));
    }
  });

  it("shows when a token was last used", async () => {
    const { id, token } = await create(cookieA);
    now = new Date("2026-10-09T21:40:00.000Z");
    expect((await useToken(token)).statusCode).toBe(200);

    const { tokens } = await list(cookieA);
    expect(tokens.find((summary) => summary.id === id)?.lastUsedAt).toBe("2026-10-09T21:40:00.000Z");
  });

  it("only the caller's own tokens", async () => {
    const mine = await create(cookieA);
    const theirs = await create(cookieB);

    expect((await list(cookieA)).tokens.map((summary) => summary.id)).toEqual([mine.id]);
    expect((await list(cookieB)).tokens.map((summary) => summary.id)).toEqual([theirs.id]);
  });

  it("is empty before any token exists", async () => {
    expect((await list(cookieA)).tokens).toEqual([]);
  });
});

describe("POST /api/claude-tokens/:id/revoke", () => {
  it("revokes: the token stops working and stays listed with its revokedAt", async () => {
    const { id, token } = await create(cookieA);
    now = new Date("2026-10-09T09:00:00.000Z");

    const res = await revoke(cookieA, id);
    expect(res.statusCode).toBe(200);
    expect(revokeClaudeTokenResponseSchema.parse(res.json())).toEqual({ id, revokedAt: "2026-10-09T09:00:00.000Z" });

    expectError(await useToken(token), 401, "unauthorized");
    expect((await list(cookieA)).tokens).toEqual([
      { id, createdAt: "2026-10-09T08:00:00.000Z", lastUsedAt: null, revokedAt: "2026-10-09T09:00:00.000Z" },
    ]);
  });

  it("revoking again answers the original time", async () => {
    const { id } = await create(cookieA);
    now = new Date("2026-10-09T09:00:00.000Z");
    expect((await revoke(cookieA, id)).statusCode).toBe(200);
    now = new Date("2026-10-09T10:00:00.000Z");

    const again = await revoke(cookieA, id);
    expect(again.statusCode).toBe(200);
    expect(revokeClaudeTokenResponseSchema.parse(again.json()).revokedAt).toBe("2026-10-09T09:00:00.000Z");
  });

  it("an empty JSON body is fine", async () => {
    const { id } = await create(cookieA);
    const res = await t.app.inject({
      method: "POST",
      url: `/api/claude-tokens/${id}/revoke`,
      headers: { cookie: cookieA, "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("B can't revoke A's token: 404, and A's token keeps working", async () => {
    const { id, token } = await create(cookieA);

    expectError(await revoke(cookieB, id), 404, "not_found");
    expect((await useToken(token)).statusCode).toBe(200);
    expect((await list(cookieA)).tokens[0]?.revokedAt).toBeNull();
  });

  it("an unknown id is 404", async () => {
    await create(cookieA);
    expectError(await revoke(cookieA, "no-such-token"), 404, "not_found");
  });
});

describe("behind the Ward guard", () => {
  it("every token route is 401 without a Ward session, even with a Claude token", async () => {
    const { id, token } = await create(cookieA);
    const authorization = `Bearer ${token}`;

    for (const request of [
      { method: "GET", url: "/api/claude-tokens" },
      { method: "POST", url: "/api/claude-tokens" },
      { method: "POST", url: `/api/claude-tokens/${id}/revoke` },
    ] as const) {
      expectError(await t.app.inject(request), 401, "unauthorized");
      expectError(await t.app.inject({ ...request, headers: { authorization } }), 401, "unauthorized");
    }
    expect((await list(cookieA)).tokens.map((summary) => summary.revokedAt)).toEqual([null]);
  });
});

describe("logging", () => {
  it("never writes the token or its hash", async () => {
    const { id, token } = await create(cookieA);
    await list(cookieA);
    await useToken(token);
    await revoke(cookieA, id);

    const output = t.logs.join("\n");
    expect(t.logs.length).toBeGreaterThan(0);
    expect(output).not.toContain(token);
    expect(output).not.toContain(sha256(token));
  });
});

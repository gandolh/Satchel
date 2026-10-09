import { randomUUID } from "node:crypto";
import { errorResponseSchema, meResponseSchema } from "@satchel/shared";
import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { openDb } from "../db/open.js";
import { createStore } from "../store.js";
import { ACCESS_TOKEN_ALG } from "./claims.js";
import { createWardClient } from "./client.js";
import { startFakeWard } from "./testing/fakeWard.js";
import { TEST_APP_KEY, startTestApp, wardCookie, type TestApp } from "./testing/testApp.js";

const A = { subject: "subject-a", username: "ana" };
const B = { subject: "subject-b", username: "bogdan" };

let t: TestApp;

beforeEach(async () => {
  t = await startTestApp();
});

afterEach(async () => {
  await t.close();
});

async function me(cookie?: string) {
  return t.app.inject({ method: "GET", url: "/api/me", headers: cookie ? { cookie } : {} });
}

function expectError(res: { statusCode: number; json(): unknown }, status: number, code: string) {
  expect(res.statusCode).toBe(status);
  expect(errorResponseSchema.parse(res.json()).error.code).toBe(code);
}

function accountCount(): number {
  return t.db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM accounts").get()?.n ?? -1;
}

function displayName(subject: string): string | undefined {
  return t.db
    .prepare<[string], { display_name: string }>("SELECT display_name FROM accounts WHERE subject = ?")
    .get(subject)?.display_name;
}

describe("signed in with a Satchel grant", () => {
  it("answers /api/me with the subject, display name and inbox, and creates both", async () => {
    const res = await me(await t.signIn(A));

    expect(res.statusCode).toBe(200);
    const body = meResponseSchema.parse(res.json());
    expect(body.subject).toBe(A.subject);
    expect(body.displayName).toBe(A.username);

    expect(displayName(A.subject)).toBe(A.username);
    const conversations = t.store.listConversations(A.subject);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({ id: body.inboxId, kind: "inbox" });
  });

  it("keeps one inbox and refreshes the display name on later requests", async () => {
    const first = meResponseSchema.parse((await me(await t.signIn(A))).json());
    const second = meResponseSchema.parse((await me(await t.signIn({ ...A, username: "ana-renamed" }))).json());

    expect(second.inboxId).toBe(first.inboxId);
    expect(second.displayName).toBe("ana-renamed");
    expect(displayName(A.subject)).toBe("ana-renamed");
    expect(t.store.listConversations(A.subject)).toHaveLength(1);
  });

  it("sends the app key and caches the introspection answer per token", async () => {
    const cookie = await t.signIn(A);
    expect((await me(cookie)).statusCode).toBe(200);
    expect((await me(cookie)).statusCode).toBe(200);

    expect(t.fakeWard.lastAppKey).toBe(TEST_APP_KEY);
    expect(t.fakeWard.introspectCallCount).toBe(1);
  });
});

describe("401 unauthorized", () => {
  it("no cookie", async () => {
    expectError(await me(), 401, "unauthorized");
    expect(t.fakeWard.introspectCallCount).toBe(0);
  });

  it("an empty ward_session cookie", async () => {
    expectError(await me("ward_session="), 401, "unauthorized");
  });

  it("a bearer header instead of the cookie (the guard reads only the cookie)", async () => {
    const token = (await t.signIn(A)).replace("ward_session=", "");
    const res = await t.app.inject({ method: "GET", url: "/api/me", headers: { authorization: `Bearer ${token}` } });
    expectError(res, 401, "unauthorized");
  });

  it("an expired token", async () => {
    const sessionId = "family_expired";
    t.fakeWard.setSession(sessionId, { active: true, ...A, grants: { satchel: ["admin"] } });
    const token = await t.fakeWard.mintToken({
      subject: A.subject,
      sessionId,
      issuedAt: new Date(Date.now() - 60 * 60_000),
      expiresInSeconds: 900,
    });

    expectError(await me(wardCookie(token)), 401, "unauthorized");
    expect(t.fakeWard.introspectCallCount).toBe(0);
  });

  it("a token from another issuer", async () => {
    const sessionId = "family_issuer";
    t.fakeWard.setSession(sessionId, { active: true, ...A, grants: { satchel: ["admin"] } });
    const token = await t.fakeWard.mintToken({ subject: A.subject, sessionId, issuer: "https://evil.example" });

    expectError(await me(wardCookie(token)), 401, "unauthorized");
  });

  it("a session Ward says is not active", async () => {
    const sessionId = "family_revoked";
    t.fakeWard.setSession(sessionId, { active: false, ...A, grants: { satchel: ["admin"] } });
    const token = await t.fakeWard.mintToken({ subject: A.subject, sessionId });

    expectError(await me(wardCookie(token)), 401, "unauthorized");
    expect(accountCount()).toBe(0);
  });
});

describe("the JWT is verified with EdDSA only", () => {
  it("pins the algorithm to the EdDSA literal", () => {
    expect(ACCESS_TOKEN_ALG).toBe("EdDSA");
  });

  it("refuses an unsigned (alg: none) token without asking Ward", async () => {
    t.fakeWard.setSession("family_default", { active: true, ...A, grants: { satchel: ["admin"] } });
    const token = t.fakeWard.mintUnsignedToken({ subject: A.subject });

    expectError(await me(wardCookie(token)), 401, "unauthorized");
    expect(t.fakeWard.introspectCallCount).toBe(0);
  });

  it("refuses HS256 signed with the public key's own bytes (alg confusion)", async () => {
    const jwks = (await (await fetch(t.fakeWard.jwksEndpoint)).json()) as { keys: { kid: string; x: string }[] };
    const publicKey = jwks.keys[0];
    if (!publicKey) throw new Error("fake Ward published no key");
    const sessionId = "family_hs256";
    t.fakeWard.setSession(sessionId, { active: true, ...A, grants: { satchel: ["admin"] } });

    const forged = await new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: "HS256", kid: publicKey.kid, typ: "JWT" })
      .setSubject(A.subject)
      .setJti(randomUUID())
      .setIssuer(t.fakeWard.origin)
      .setAudience("ward-estate")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(Buffer.from(publicKey.x, "base64url"));

    expectError(await me(wardCookie(forged)), 401, "unauthorized");
    expect(t.fakeWard.introspectCallCount).toBe(0);
  });
});

describe("403 forbidden", () => {
  it("a live session with no Satchel grant", async () => {
    const cookie = await t.signIn({ ...A, grants: { atrium: ["admin"], prm: ["member"] } });

    expectError(await me(cookie), 403, "forbidden");
    expect(accountCount()).toBe(0);
  });

  it("a Satchel grant with no roles", async () => {
    expectError(await me(await t.signIn({ ...A, grants: { satchel: [] } })), 403, "forbidden");
  });

  it("revokes the subject's Claude tokens once the grant is gone", async () => {
    const withGrant = await t.signIn(A);
    const created = await t.app.inject({ method: "POST", url: "/api/claude-tokens", headers: { cookie: withGrant } });
    expect(created.statusCode).toBe(201);
    const { token } = created.json<{ token: string }>();
    t.store.upsertAccount(B.subject, B.username);
    const other = t.store.createClaudeToken(B.subject);
    expect(t.store.resolveClaudeToken(token)).not.toBeNull();

    // A fresh session (a fresh token, so no cached introspection) whose grants lost satchel.
    const withoutGrant = await t.signIn({ ...A, grants: { atrium: ["admin"] } });
    expectError(await me(withoutGrant), 403, "forbidden");

    expect(t.store.resolveClaudeToken(token)).toBeNull();
    expect(t.store.listClaudeTokens(A.subject).every((row) => row.revokedAt !== null)).toBe(true);
    expect(t.store.resolveClaudeToken(other.token)).not.toBeNull();
  });
});

describe("cross-origin writes are refused before Ward is asked", () => {
  const FOREIGN = "https://evil.gandolh.ro";

  /** A signed-in caller with their inbox id, and how many introspections that took. */
  async function signedInWithInbox() {
    const cookie = await t.signIn(A);
    const { inboxId } = meResponseSchema.parse((await me(cookie)).json());
    return { cookie, inboxId, introspections: t.fakeWard.introspectCallCount };
  }

  function writes(inboxId: string, tokenId: string) {
    return [
      { method: "POST" as const, url: "/api/claude-tokens" },
      { method: "POST" as const, url: `/api/claude-tokens/${tokenId}/revoke` },
      {
        method: "POST" as const,
        url: `/api/conversations/${inboxId}/messages`,
        payload: { clientId: randomUUID(), text: "hello" },
      },
      { method: "POST" as const, url: `/api/conversations/${inboxId}/seen`, payload: { upTo: 0 } },
    ];
  }

  for (const [label, headers] of [
    ["an Origin that is not the app's", { origin: FOREIGN }],
    ["Origin: null", { origin: "null" }],
    ["Sec-Fetch-Site: cross-site and no Origin", { "sec-fetch-site": "cross-site" }],
    ["Sec-Fetch-Site: same-site and no Origin", { "sec-fetch-site": "same-site" }],
  ] as const) {
    it(`403 on every write with ${label}, with no introspection and nothing changed`, async () => {
      const { cookie, inboxId, introspections } = await signedInWithInbox();
      const { id: tokenId, token } = t.store.createClaudeToken(A.subject);

      for (const request of writes(inboxId, tokenId)) {
        const res = await t.app.inject({ ...request, headers: { cookie, ...headers } });
        expectError(res, 403, "forbidden");
      }

      expect(t.fakeWard.introspectCallCount).toBe(introspections);
      expect(t.store.listClaudeTokens(A.subject)).toHaveLength(1);
      expect(t.store.resolveClaudeToken(token)?.tokenId).toBe(tokenId);
      expect(t.store.latestSeq(inboxId)).toBe(0);
    });
  }

  it("refuses a cross-origin write even with no cookie, before the 401", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/claude-tokens", headers: { origin: FOREIGN } });
    expectError(res, 403, "forbidden");
    expect(t.fakeWard.introspectCallCount).toBe(0);
  });

  for (const [label, headers] of [
    ["the app's own Origin", (origin: string) => ({ origin })],
    ["Sec-Fetch-Site: same-origin and no Origin", () => ({ "sec-fetch-site": "same-origin" })],
    ["neither header (a non-browser client)", () => ({})],
    [
      "the app's own Origin and Sec-Fetch-Site: same-origin",
      (origin: string) => ({ origin, "sec-fetch-site": "same-origin" }),
    ],
  ] as const) {
    it(`lets every write through with ${label}`, async () => {
      const { cookie, inboxId } = await signedInWithInbox();
      const extra = headers(t.origin);

      const created = await t.app.inject({ method: "POST", url: "/api/claude-tokens", headers: { cookie, ...extra } });
      expect(created.statusCode).toBe(201);
      const { id: tokenId } = created.json<{ id: string }>();

      const [, revoke, send, seen] = writes(inboxId, tokenId);
      for (const [request, status] of [
        [revoke, 200],
        [send, 201],
        [seen, 200],
      ] as const) {
        if (!request) throw new Error("missing request");
        const res = await t.app.inject({ ...request, headers: { cookie, ...extra } });
        expect(res.statusCode).toBe(status);
      }
      expect(t.store.latestSeq(inboxId)).toBe(1);
    });
  }

  it("lets a GET through with a foreign Origin or Sec-Fetch-Site: cross-site", async () => {
    const cookie = await t.signIn(A);
    for (const headers of [{ origin: FOREIGN }, { "sec-fetch-site": "cross-site" }]) {
      const res = await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie, ...headers } });
      expect(res.statusCode).toBe(200);
    }
  });

  it("does not apply to /api/health or /claude/*", async () => {
    const health = await t.app.inject({ method: "GET", url: "/api/health", headers: { origin: FOREIGN } });
    expect(health.statusCode).toBe(200);

    await signedInWithInbox();
    const { token } = t.store.createClaudeToken(A.subject);
    const res = await t.app.inject({
      method: "POST",
      url: "/claude/seen",
      headers: { authorization: `Bearer ${token}`, origin: FOREIGN },
      payload: { upTo: 0 },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("503 unavailable, never 401", () => {
  it("Ward unreachable before the key set was ever fetched", async () => {
    const cookie = await t.signIn(A);
    await t.fakeWard.close();

    expectError(await me(cookie), 503, "unavailable");
  });

  it("Ward unreachable for introspection after the key set is cached", async () => {
    expect((await me(await t.signIn(A))).statusCode).toBe(200);
    const fresh = await t.signIn(A);
    await t.fakeWard.close();

    expectError(await me(fresh), 503, "unavailable");
  });

  it("introspection answers 500", async () => {
    const cookie = await t.signIn(A);
    t.fakeWard.forceIntrospectStatus(500);

    expectError(await me(cookie), 503, "unavailable");
  });

  it("introspection answers a body outside the contract", async () => {
    const fake = await startFakeWard();
    const odd: typeof fetch = async (input, init) => {
      if (String(input).endsWith("/introspect")) return new Response(JSON.stringify({ ok: "yes" }), { status: 200 });
      return fetch(input, init);
    };
    const ward = createWardClient({ publicOrigin: fake.origin, apiBasePath: "", appKey: TEST_APP_KEY, fetch: odd });
    const db = openDb(":memory:");
    const app = buildApp({
      store: createStore(db, () => new Date()),
      ward,
      publicOrigin: fake.origin,
      clock: () => new Date(),
      logger: false,
    });
    try {
      fake.setSession("family_odd", { active: true, ...A, grants: { satchel: ["admin"] } });
      const token = await fake.mintToken({ subject: A.subject, sessionId: "family_odd" });
      const res = await app.inject({ method: "GET", url: "/api/me", headers: { cookie: wardCookie(token) } });
      expectError(res, 503, "unavailable");
    } finally {
      await app.close();
      db.close();
      await fake.close();
    }
  });
});

describe("a wrong WARD_APP_KEY", () => {
  it("answers 503 and logs an error naming WARD_APP_KEY", async () => {
    const wrong = await startTestApp({ appKey: "wak_wrong", captureLogs: true });
    try {
      const cookie = await wrong.signIn(A);
      expectError(
        await wrong.app.inject({ method: "GET", url: "/api/me", headers: { cookie } }),
        503,
        "unavailable",
      );
      const errors = wrong.logs
        .map((line) => JSON.parse(line) as { level: number; msg: string })
        .filter((line) => line.level >= 50);
      expect(errors.some((line) => line.msg.includes("WARD_APP_KEY"))).toBe(true);
      expect(wrong.fakeWard.introspectCallCount).toBe(1);
    } finally {
      await wrong.close();
    }
  });
});

describe("what the guard covers", () => {
  it("/api/health needs no cookie", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(t.fakeWard.introspectCallCount).toBe(0);
  });

  it("an unknown /api path is 401 without a session and 404 with one", async () => {
    expectError(await t.app.inject({ method: "GET", url: "/api/nope" }), 401, "unauthorized");
    const cookie = await t.signIn(A);
    expectError(await t.app.inject({ method: "GET", url: "/api/nope", headers: { cookie } }), 404, "not_found");
  });

  it("a query string or encoded path does not skip it", async () => {
    expectError(await t.app.inject({ method: "GET", url: "/api/me?x=/api/health" }), 401, "unauthorized");
    const encoded = await t.app.inject({ method: "GET", url: "/%61pi/me" });
    expect([401, 404]).toContain(encoded.statusCode);
    expect(encoded.statusCode).not.toBe(200);
  });

  it("/claude/* never runs it, even with a valid Ward cookie", async () => {
    const cookie = await t.signIn(A);
    const res = await t.app.inject({ method: "GET", url: "/claude/unread", headers: { cookie } });
    expect(res.statusCode).not.toBe(200);
    expect(t.fakeWard.introspectCallCount).toBe(0);
    expect(accountCount()).toBe(0);
  });
});

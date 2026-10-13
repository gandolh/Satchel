import { createClaudeTokenResponseSchema, errorResponseSchema, meResponseSchema } from "@satchel/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWardIdentities } from "../../vendor/ward/ward-auth.js";
import { SESSION_COOKIE } from "../app.js";
import { FAKE_ISSUER } from "../testing/fakeWard.js";
import {
  TEST_API_PREFIX,
  TEST_PASSWORD,
  TEST_WEB_BASE,
  startTestApp,
  type TestApp,
} from "../testing/testApp.js";
import { OWNER_ROLE, signedIn, type SignedInAccount } from "./guard.js";

/**
 * Local sign-in, the guard (the vendored plugin plus `auth/guard.ts`) over
 * HTTP, the Ward check, and the Ward routes being wired. The guard over a
 * WebSocket is in `live/live.test.ts`.
 */

const A = { subject: "subject-a", username: "ana" };
const B = { subject: "subject-b", username: "bogdan", role: "member" };

let t: TestApp;

beforeEach(async () => {
  t = await startTestApp();
});

afterEach(async () => {
  await t.close();
});

function me(cookie?: string) {
  return t.app.inject({ method: "GET", url: "/api/me", headers: cookie ? { cookie } : {} });
}

/** Writes a browser sends carry the app's own `Origin`; the plugin refuses a `POST` without a matching one from a browser. */
function post(url: string, options: { cookie?: string; payload?: object; origin?: string } = {}) {
  return t.app.inject({
    method: "POST",
    url,
    headers: { origin: options.origin ?? t.origin, ...(options.cookie ? { cookie: options.cookie } : {}) },
    ...(options.payload ? { payload: options.payload } : {}),
  });
}

function displayName(subject: string): string | undefined {
  return t.db
    .prepare<[string], { display_name: string }>("SELECT display_name FROM accounts WHERE subject = ?")
    .get(subject)?.display_name;
}

function inboxCount(): number {
  return t.db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM conversations WHERE kind = 'inbox'").get()?.n ?? -1;
}

/** The `name=value` of the session cookie in a `Set-Cookie` answer. */
function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const header = (Array.isArray(raw) ? raw : [String(raw)]).find((line) => line.startsWith(`${SESSION_COOKIE}=`));
  if (header === undefined) throw new Error("no session cookie was set");
  return header.split(";")[0]!;
}

describe("local login", () => {
  it("signs a seeded user in with the password, and the cookie opens /api/me", async () => {
    await t.accounts.createUser({ username: "ana", password: TEST_PASSWORD, role: OWNER_ROLE, id: A.subject });

    const login = await post("/auth/login", { payload: { username: "ana", password: TEST_PASSWORD } });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({ user: { id: A.subject, username: "ana", role: "admin" } });

    const cookie = cookieFrom(login);
    // The cookie is scoped to the API prefix the browser sees, so it rides the WebSocket upgrade too.
    const setCookie = String(login.headers["set-cookie"]);
    expect(setCookie).toContain(`Path=${TEST_API_PREFIX}`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    const res = await me(cookie);
    expect(res.statusCode).toBe(200);
    expect(meResponseSchema.parse(res.json()).subject).toBe(A.subject);
  });

  it("works with Ward not configured at all", async () => {
    await t.close();
    t = await startTestApp({ ward: false });
    await t.accounts.createUser({ username: "ana", password: TEST_PASSWORD, role: "member", id: A.subject });

    const login = await post("/auth/login", { payload: { username: "ana", password: TEST_PASSWORD } });
    expect(login.statusCode).toBe(200);
    expect((await me(cookieFrom(login))).statusCode).toBe(200);
    expect((await t.app.inject({ method: "GET", url: "/auth/session" })).json()).toMatchObject({
      user: null,
      ward: { enabled: false },
    });
  });

  it("refuses a wrong password and an unknown user with the same answer, and signs out", async () => {
    await t.accounts.createUser({ username: "ana", password: TEST_PASSWORD, role: "member", id: A.subject });
    const wrong = await post("/auth/login", { payload: { username: "ana", password: "not the password" } });
    const unknown = await post("/auth/login", { payload: { username: "nobody", password: TEST_PASSWORD } });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: "invalid_credentials" });
    expect(unknown.json()).toEqual(wrong.json());

    const cookie = cookieFrom(await post("/auth/login", { payload: { username: "ana", password: TEST_PASSWORD } }));
    expect((await post("/auth/logout", { cookie })).statusCode).toBe(204);
    expect((await me(cookie)).statusCode).toBe(401);
  });

  it("answers GET /auth/session for the login page: signed out, with whether Ward is on", async () => {
    const res = await t.app.inject({ method: "GET", url: "/auth/session" });
    expect(res.json()).toMatchObject({ user: null, ward: { enabled: true } });
  });

  it("has no register route", async () => {
    const res = await post("/auth/register", { payload: { username: "mallory", password: TEST_PASSWORD } });
    // Not registered, so it is an unknown route, which the guard answers like any other without a session.
    expect(res.statusCode).toBe(401);
    expect(await t.accounts.findUserByUsername("mallory")).toBeUndefined();
  });
});

describe("the guard over HTTP", () => {
  it("every /api route but the health check is 401 without a session; the health check and /claude are open to the plugin", async () => {
    for (const [method, url] of [
      ["GET", "/api/me"],
      ["GET", "/api/conversations"],
      ["GET", "/api/people"],
      ["POST", "/api/conversations"],
      ["GET", "/api/claude-tokens"],
      ["GET", "/api/push/key"],
      ["GET", "/api/live"],
    ] as const) {
      const res = await t.app.inject({ method, url });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
      expect(res.json()).toMatchObject({ error: "unauthorized" });
    }
    expect((await t.app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
    // `/claude/*` takes its own bearer token, and says so in Satchel's shape.
    const claude = await t.app.inject({ method: "GET", url: "/claude/unread" });
    expect(claude.statusCode).toBe(401);
    expect(errorResponseSchema.parse(claude.json()).error.code).toBe("unauthorized");
  });

  it("a cookie that names no session is 401", async () => {
    expect((await me(`${SESSION_COOKIE}=not-a-session`)).statusCode).toBe(401);
  });

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

  it("keeps one inbox across sessions", async () => {
    const first = meResponseSchema.parse((await me(await t.signIn(A))).json());
    const second = meResponseSchema.parse((await me(await t.signIn(A))).json());
    expect(second.inboxId).toBe(first.inboxId);
    expect(t.store.listConversations(A.subject)).toHaveLength(1);
  });

  it("a write a browser sent from another origin is 403 forbidden before any handler", async () => {
    const cookie = await t.signIn(A);
    for (const headers of [
      { origin: "https://evil.example" },
      { origin: "null" },
      { "sec-fetch-site": "same-site" },
    ]) {
      const res = await t.app.inject({ method: "POST", url: "/api/claude-tokens", headers: { cookie, ...headers } });
      expect(res.statusCode).toBe(403);
      expect(errorResponseSchema.parse(res.json()).error.code).toBe("forbidden");
    }
    const own = await t.app.inject({ method: "POST", url: "/api/claude-tokens", headers: { cookie, origin: t.origin } });
    expect(own.statusCode).toBe(201);
    // A caller that sends neither header is not a browser page and passes.
    const none = await t.app.inject({ method: "POST", url: "/api/claude-tokens", headers: { cookie } });
    expect(none.statusCode).toBe(201);
  });

  it("the CLI's agent token is untouched: it reads the inbox with no session", async () => {
    const cookie = await t.signIn(A);
    const made = await t.app.inject({ method: "POST", url: "/api/claude-tokens", headers: { cookie } });
    const { token } = createClaudeTokenResponseSchema.parse(made.json());
    const res = await t.app.inject({ method: "GET", url: "/claude/unread", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
  });
});

describe("roles and the owner-only inbox", () => {
  /** A probe route behind the guard that answers with what the guard put on the request. */
  function probe() {
    t.app.get("/api/test-account", (request) => signedIn(request));
  }

  async function account(cookie: string): Promise<SignedInAccount> {
    const res = await t.app.inject({ method: "GET", url: "/api/test-account", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    return res.json<SignedInAccount>();
  }

  it("puts the user's role on the request", async () => {
    probe();
    const owner = await account(await t.signIn(A));
    const friend = await account(await t.signIn(B));

    expect(owner).toMatchObject({ subject: A.subject, username: A.username, roles: ["admin"] });
    expect(owner.inboxId).toEqual(expect.any(String));
    expect(friend).toEqual({ subject: B.subject, username: B.username, roles: ["member"], inboxId: null });
  });

  it("a friend gets no inbox: /api/me answers inboxId null and nothing is made", async () => {
    const res = await me(await t.signIn(B));

    expect(meResponseSchema.parse(res.json())).toEqual({ subject: B.subject, displayName: B.username, inboxId: null });
    expect(displayName(B.subject)).toBe(B.username);
    expect(t.store.listConversations(B.subject)).toEqual([]);
    expect(inboxCount()).toBe(0);
  });

  it("the role is the app's row: changing it changes what the next request sees", async () => {
    probe();
    const cookie = await t.signIn(A);
    expect((await account(cookie)).roles).toEqual(["admin"]);
    await t.accounts.setRole(A.subject, "member");
    expect((await account(cookie)).roles).toEqual(["member"]);
  });

  it("an account that is not an admin has its Claude tokens revoked, and the owner's survive", async () => {
    const owner = await t.signIn(A);
    await me(owner);
    const token = t.store.createClaudeToken(A.subject);
    await me(owner);
    expect(t.store.resolveClaudeToken(token.token)).not.toBeNull();

    await t.accounts.setRole(A.subject, "member");
    await me(owner);
    expect(t.store.resolveClaudeToken(token.token)).toBeNull();
  });

  it("only the owner may manage Claude tokens", async () => {
    const friend = await t.signIn(B);
    const res = await t.app.inject({ method: "GET", url: "/api/claude-tokens", headers: { cookie: friend } });
    expect(res.statusCode).toBe(403);
  });
});

describe("a session that began with Ward", () => {
  it("is asked about at Ward at most every 30 seconds, and signs the user in", async () => {
    const { cookie } = await t.signInWithWard(A);
    expect((await me(cookie)).statusCode).toBe(200);
    expect((await me(cookie)).statusCode).toBe(200);
    expect(t.fakeWard.statusCalls).toBe(1);

    t.advanceWard(31_000);
    expect((await me(cookie)).statusCode).toBe(200);
    expect(t.fakeWard.statusCalls).toBe(2);
  });

  it("ends within 30 seconds of a Ward revoke, with the reason the login page shows", async () => {
    const { cookie, wardSid } = await t.signInWithWard(A);
    expect((await me(cookie)).statusCode).toBe(200);

    t.fakeWard.setSession(wardSid, false);
    // Still inside the cache window: the answer Ward gave stands.
    expect((await me(cookie)).statusCode).toBe(200);

    t.advanceWard(31_000);
    const ended = await me(cookie);
    expect(ended.statusCode).toBe(401);
    expect(ended.json()).toMatchObject({ error: "unauthorized", reason: "ward_session_ended" });
    // The session row is gone: it does not come back if Ward says yes again.
    t.fakeWard.setSession(wardSid, true);
    t.advanceWard(31_000);
    expect((await me(cookie)).statusCode).toBe(401);
  });

  it("is refused with ward_unavailable while Ward is down, and a local session keeps working", async () => {
    const ward = await t.signInWithWard(A);
    const local = await t.signIn(B);
    expect((await me(ward.cookie)).statusCode).toBe(200);

    t.fakeWard.down = true;
    t.advanceWard(31_000);

    const refused = await me(ward.cookie);
    expect(refused.statusCode).toBe(401);
    expect(refused.json()).toMatchObject({ reason: "ward_unavailable" });
    expect((await me(local)).statusCode).toBe(200);

    // Ward back: the same session resumes (its row was kept).
    t.fakeWard.down = false;
    expect((await me(ward.cookie)).statusCode).toBe(200);
  });

  it("is refused with ward_unavailable when this app has no Ward configured", async () => {
    await t.close();
    t = await startTestApp({ ward: false });
    const user = await t.accounts.createUser({ username: "ana", password: TEST_PASSWORD, role: "admin", id: A.subject });
    const { token } = await t.accounts.startSession(user.id, { origin: "ward", wardSid: "family_x" });

    const res = await me(`${SESSION_COOKIE}=${token}`);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ reason: "ward_unavailable" });
  });
});

describe("the Ward routes are wired", () => {
  it("POST /auth/ward/start answers a URL on Ward's authorization endpoint, under the redirect URI the app registered", async () => {
    const res = await post("/auth/ward/start", { payload: {} });
    expect(res.statusCode).toBe(200);
    const { url } = res.json<{ url: string }>();
    expect(url.startsWith(`${FAKE_ISSUER}/auth?`)).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("client_id")).toBe("satchel");
    expect(params.get("redirect_uri")).toBe(`${t.origin}${TEST_API_PREFIX}/auth/ward/callback`);
    expect(params.get("code_challenge_method")).toBe("S256");
    // The flow's secrets travel in a cookie scoped to the callback, not in the URL.
    const flow = String(res.headers["set-cookie"]);
    expect(flow).toContain(`${SESSION_COOKIE}_ward=`);
    expect(flow).toContain(`Path=${TEST_API_PREFIX}/auth/ward/callback`);
  });

  it("the callback without a flow sends the browser to the login page with ward_error", async () => {
    const res = await t.app.inject({ method: "GET", url: "/auth/ward/callback?code=x&state=y" });
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe(`${t.origin}${TEST_WEB_BASE}?ward_error=invalid_callback`);
  });

  it("Ward off: no Ward routes", async () => {
    await t.close();
    t = await startTestApp({ ward: false });
    expect((await post("/auth/ward/start", { payload: {} })).statusCode).toBe(401);
    expect((await t.app.inject({ method: "GET", url: "/auth/ward/callback" })).statusCode).toBe(401);
  });

  it("settings can link and unlink Ward; unlinking is refused without a local password", async () => {
    // A Ward-created user: linked, no local password.
    const identities = createWardIdentities({ accounts: t.accounts });
    await identities.createLinkedUser({ subject: "ward-subject-1", username: "wanda", role: "member" });
    const user = await t.accounts.findUserByUsername("wanda");
    const startSession = async () => `${SESSION_COOKIE}=${(await t.accounts.startSession(user!.id)).token}`;
    let cookie = await startSession();

    const session = await t.app.inject({ method: "GET", url: "/auth/session", headers: { cookie } });
    expect(session.json()).toMatchObject({ user: { hasPassword: false }, ward: { enabled: true, linked: true } });

    const refused = await post("/auth/ward/unlink", { cookie });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: "no_local_password" });

    // Setting a password ends every other session; sign in again.
    await t.accounts.setPassword(user!.id, TEST_PASSWORD);
    cookie = await startSession();
    const unlinked = await post("/auth/ward/unlink", { cookie });
    expect(unlinked.statusCode).toBe(200);
    expect(await identities.findUserBySubject("ward-subject-1")).toBeUndefined();

    // Not linked any more: Settings offers "Link Ward", which starts a round trip.
    const start = await post("/auth/ward/link", { cookie });
    expect(start.statusCode).toBe(200);
    expect(start.json<{ url: string }>().url.startsWith(`${FAKE_ISSUER}/auth?`)).toBe(true);
  });

  it("a local user sets and changes a password from settings", async () => {
    const cookie = await t.signIn(A);
    const changed = await post("/auth/password", {
      cookie,
      payload: { currentPassword: TEST_PASSWORD, newPassword: "a different passphrase" },
    });
    expect(changed.statusCode).toBe(204);
    const login = await post("/auth/login", { payload: { username: A.username, password: "a different passphrase" } });
    expect(login.statusCode).toBe(200);
  });
});

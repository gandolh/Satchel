import { errorResponseSchema, routes, sendMessageRequestSchema } from "@satchel/shared";
import type { InjectOptions } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BODY_LIMIT_BYTES } from "./app.js";
import { ApiError } from "./errors.js";
import { ClientIdConflict, NotAMember } from "./store.js";
import { startTestApp, type TestApp } from "./testing/testApp.js";

let t: TestApp;
let cookie: string;

/** Every route is behind the session guard, the test routes below included, so a request carries a session unless it says otherwise. */
function inject(options: InjectOptions) {
  return t.app.inject({ ...options, headers: { cookie, ...options.headers } });
}

/** Test-only routes outside `/api`. */
async function start(options: { captureLogs?: boolean } = {}) {
  t = await startTestApp(options);
  cookie = await t.signIn({ subject: "subject-a", username: "ana" });
  t.app.post("/test/echo", (request) => ({ bodyIsUndefined: request.body === undefined, body: request.body ?? null }));
  t.app.get("/test/zod", () => sendMessageRequestSchema.parse({ clientId: "not-a-uuid", text: "hi" }));
  t.app.get("/test/conflict", () => {
    throw new ClientIdConflict("c-1");
  });
  t.app.get("/test/not-a-member", () => {
    throw new NotAMember("conversation-1", "subject-b");
  });
  t.app.get("/test/boom", () => {
    throw new Error("database file is at /srv/secret/path");
  });
  t.app.get("/test/api-error", () => {
    throw new ApiError("not_found", "No such conversation.");
  });
  t.app.get("/test/log-headers", (request) => {
    request.log.info({ headers: request.headers, request: { headers: request.headers } }, "headers");
    return { ok: true };
  });
}

function expectError(res: { statusCode: number; json(): unknown }, status: number, code: string) {
  expect(res.statusCode).toBe(status);
  const body = errorResponseSchema.parse(res.json());
  expect(body.error.code).toBe(code);
  return body.error.message;
}

afterEach(async () => {
  await t.close();
});

describe("JSON bodies", () => {
  beforeEach(() => start());

  it("an empty body with Content-Type: application/json is undefined, not a 400", async () => {
    const res = await inject({ method: "POST", url: "/test/echo", headers: { "content-type": "application/json" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ bodyIsUndefined: true, body: null });
  });

  it("a JSON body still parses", async () => {
    const res = await inject({ method: "POST", url: "/test/echo", payload: { upTo: 3 } });
    expect(res.json()).toEqual({ bodyIsUndefined: false, body: { upTo: 3 } });
  });

  it("bad JSON is 400 invalid_request", async () => {
    const res = await inject({
      method: "POST",
      url: "/test/echo",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expectError(res, 400, "invalid_request");
  });

  it("a __proto__ key is refused", async () => {
    const res = await inject({
      method: "POST",
      url: "/test/echo",
      headers: { "content-type": "application/json" },
      payload: '{"__proto__":{"admin":true}}',
    });
    expectError(res, 400, "invalid_request");
  });

  it("a body over 64 KB is refused", async () => {
    const res = await inject({
      method: "POST",
      url: "/test/echo",
      payload: { text: "x".repeat(BODY_LIMIT_BYTES) },
    });
    expectError(res, 413, "invalid_request");
  });

  it("an unsupported content type is refused", async () => {
    const res = await inject({
      method: "POST",
      url: "/test/echo",
      headers: { "content-type": "application/xml" },
      payload: "<a/>",
    });
    expectError(res, 415, "invalid_request");
  });
});

describe("error mapping", () => {
  beforeEach(() => start({ captureLogs: true }));

  it("a zod error is 400 invalid_request with the first issue's message", async () => {
    const message = expectError(await inject({ method: "GET", url: "/test/zod" }), 400, "invalid_request");
    const expected = sendMessageRequestSchema.safeParse({ clientId: "not-a-uuid", text: "hi" }).error?.issues[0]?.message;
    expect(message).toBe(expected);
  });

  it("ClientIdConflict is 409 client_id_conflict", async () => {
    expectError(await inject({ method: "GET", url: "/test/conflict" }), 409, "client_id_conflict");
  });

  it("ApiError answers its own code", async () => {
    const message = expectError(await inject({ method: "GET", url: "/test/api-error" }), 404, "not_found");
    expect(message).toBe("No such conversation.");
  });

  it("NotAMember is 500 internal with no details", async () => {
    const res = await inject({ method: "GET", url: "/test/not-a-member" });
    expectError(res, 500, "internal");
    expect(res.body).not.toContain("subject-b");
  });

  it("an unexpected error is 500 internal, logged, with no details in the answer", async () => {
    const res = await inject({ method: "GET", url: "/test/boom" });
    expectError(res, 500, "internal");
    expect(res.body).not.toContain("/srv/secret/path");
    expect(t.logs.join("\n")).toContain("/srv/secret/path");
  });

  it("an unknown route is 404 not_found", async () => {
    expectError(await inject({ method: "GET", url: "/nowhere" }), 404, "not_found");
  });
});

describe("logging", () => {
  beforeEach(() => start({ captureLogs: true }));

  it("never writes the session cookie or an Authorization header", async () => {
    const token = cookie.replace("satchel_session=", "");
    const bearer = "stl_secret_claude_token";

    await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie, authorization: `Bearer ${bearer}` } });
    await t.app.inject({ method: "GET", url: "/test/log-headers", headers: { cookie, authorization: `Bearer ${bearer}` } });
    await t.app.inject({ method: "GET", url: "/test/boom", headers: { cookie, authorization: `Bearer ${bearer}` } });
    // A Ward-originated session while Ward is down: the guard logs its refusal.
    t.fakeWard.down = true;
    const ward = await t.signInWithWard({ subject: "s", username: "s" });
    await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie: ward.cookie } });

    const output = t.logs.join("\n");
    expect(t.logs.length).toBeGreaterThan(0);
    expect(output).toContain("[redacted]");
    expect(output).not.toContain(token);
    expect(output).not.toContain(bearer);
  });
});

describe("every route in the contract sits behind the right door", () => {
  beforeEach(() => start());

  it("session routes answer 401 without a cookie; claude routes never call Ward", async () => {
    await t.app.ready();
    let checked = 0;

    for (const route of Object.values(routes)) {
      const url = route.path.replace(":id", "some-id");
      if (!t.app.hasRoute({ method: route.method, url: route.path })) continue;
      checked += 1;

      if (route.auth === "ward") {
        // The plugin's own answer: `{ error: "unauthorized" }`, not Satchel's error shape.
        const res = await t.app.inject({ method: route.method, url });
        expect(res.statusCode).toBe(401);
        expect(res.json()).toMatchObject({ error: "unauthorized" });
      } else if (route.auth === "claude") {
        // A Claude route is not behind the session guard: a session cookie neither opens it nor is asked about.
        const before = t.fakeWard.requests.length;
        const res = await t.app.inject({ method: route.method, url, headers: { cookie } });
        expectError(res, 401, "unauthorized");
        expect(t.fakeWard.requests.length).toBe(before);
      } else {
        expect((await t.app.inject({ method: route.method, url })).statusCode).toBe(200);
      }
    }

    // At least /api/health and /api/me today; briefs 05 and 06 add the rest.
    expect(checked).toBeGreaterThanOrEqual(2);
  });
});

import { errorResponseSchema, routes, sendMessageRequestSchema } from "@satchel/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BODY_LIMIT_BYTES } from "./app.js";
import { ApiError } from "./errors.js";
import { ClientIdConflict, NotAMember } from "./store.js";
import { startTestApp, type TestApp } from "./ward/testing/testApp.js";

let t: TestApp;

/** Test-only routes outside `/api`, so the guard stays out of the way. */
async function start(options: { captureLogs?: boolean } = {}) {
  t = await startTestApp(options);
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
    const res = await t.app.inject({ method: "POST", url: "/test/echo", headers: { "content-type": "application/json" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ bodyIsUndefined: true, body: null });
  });

  it("a JSON body still parses", async () => {
    const res = await t.app.inject({ method: "POST", url: "/test/echo", payload: { upTo: 3 } });
    expect(res.json()).toEqual({ bodyIsUndefined: false, body: { upTo: 3 } });
  });

  it("bad JSON is 400 invalid_request", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/test/echo",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expectError(res, 400, "invalid_request");
  });

  it("a __proto__ key is refused", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/test/echo",
      headers: { "content-type": "application/json" },
      payload: '{"__proto__":{"admin":true}}',
    });
    expectError(res, 400, "invalid_request");
  });

  it("a body over 64 KB is refused", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/test/echo",
      payload: { text: "x".repeat(BODY_LIMIT_BYTES) },
    });
    expectError(res, 413, "invalid_request");
  });

  it("an unsupported content type is refused", async () => {
    const res = await t.app.inject({
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
    const message = expectError(await t.app.inject({ method: "GET", url: "/test/zod" }), 400, "invalid_request");
    const expected = sendMessageRequestSchema.safeParse({ clientId: "not-a-uuid", text: "hi" }).error?.issues[0]?.message;
    expect(message).toBe(expected);
  });

  it("ClientIdConflict is 409 client_id_conflict", async () => {
    expectError(await t.app.inject({ method: "GET", url: "/test/conflict" }), 409, "client_id_conflict");
  });

  it("ApiError answers its own code", async () => {
    const message = expectError(await t.app.inject({ method: "GET", url: "/test/api-error" }), 404, "not_found");
    expect(message).toBe("No such conversation.");
  });

  it("NotAMember is 500 internal with no details", async () => {
    const res = await t.app.inject({ method: "GET", url: "/test/not-a-member" });
    expectError(res, 500, "internal");
    expect(res.body).not.toContain("subject-b");
  });

  it("an unexpected error is 500 internal, logged, with no details in the answer", async () => {
    const res = await t.app.inject({ method: "GET", url: "/test/boom" });
    expectError(res, 500, "internal");
    expect(res.body).not.toContain("/srv/secret/path");
    expect(t.logs.join("\n")).toContain("/srv/secret/path");
  });

  it("an unknown route is 404 not_found", async () => {
    expectError(await t.app.inject({ method: "GET", url: "/nowhere" }), 404, "not_found");
  });
});

describe("logging", () => {
  beforeEach(() => start({ captureLogs: true }));

  it("never writes the Ward cookie or an Authorization header", async () => {
    const cookie = await t.signIn({ subject: "subject-a", username: "ana" });
    const token = cookie.replace("ward_session=", "");
    const bearer = "stl_secret_claude_token";

    await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie, authorization: `Bearer ${bearer}` } });
    await t.app.inject({ method: "GET", url: "/test/log-headers", headers: { cookie, authorization: `Bearer ${bearer}` } });
    await t.app.inject({ method: "GET", url: "/test/boom", headers: { cookie, authorization: `Bearer ${bearer}` } });
    t.fakeWard.forceIntrospectStatus(500);
    await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie: await t.signIn({ subject: "s", username: "s" }) } });

    const output = t.logs.join("\n");
    expect(t.logs.length).toBeGreaterThan(0);
    expect(output).toContain("[redacted]");
    expect(output).not.toContain(token);
    expect(output).not.toContain(bearer);
  });
});

describe("every route in the contract sits behind the right door", () => {
  beforeEach(() => start());

  it("ward routes answer 401 without a cookie; claude routes never call Ward", async () => {
    await t.app.ready();
    const cookie = await t.signIn({ subject: "subject-a", username: "ana" });
    let checked = 0;

    for (const route of Object.values(routes)) {
      const url = route.path.replace(":id", "some-id");
      if (!t.app.hasRoute({ method: route.method, url: route.path })) continue;
      checked += 1;

      if (route.auth === "ward") {
        const res = await t.app.inject({ method: route.method, url });
        expectError(res, 401, "unauthorized");
      } else if (route.auth === "claude") {
        const before = t.fakeWard.introspectCallCount;
        const res = await t.app.inject({ method: route.method, url, headers: { cookie } });
        expect(res.statusCode).not.toBe(200);
        expect(t.fakeWard.introspectCallCount).toBe(before);
      } else {
        expect((await t.app.inject({ method: route.method, url })).statusCode).toBe(200);
      }
    }

    // At least /api/health and /api/me today; briefs 05 and 06 add the rest.
    expect(checked).toBeGreaterThanOrEqual(2);
  });
});

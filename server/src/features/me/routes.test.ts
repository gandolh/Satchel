import { routes } from "@satchel/shared";
import { afterEach, beforeEach, expect, it } from "vitest";
import { routeSchemas } from "../../testing/routeSchemas.js";
import { startTestApp, type TestApp } from "../../testing/testApp.js";
import { meRoutes } from "./routes.js";

let t: TestApp;

beforeEach(async () => {
  t = await startTestApp();
});

afterEach(async () => {
  await t.close();
});

it("declares the contract's response schema", async () => {
  expect(await routeSchemas(meRoutes, {})).toEqual({
    [`GET ${routes.me.path}`]: { response: { 200: routes.me.response } },
  });
});

it("answers the owner with the inbox and a friend with none, and 401 with no session", async () => {
  const owner = await t.signIn({ subject: "subject-a", username: "ana" });
  const friend = await t.signIn({ subject: "subject-b", username: "bob", role: "member" });
  const mine = await t.app.inject({ method: "GET", url: routes.me.path, headers: { cookie: owner } });
  expect(mine.statusCode).toBe(200);
  expect(Object.keys(mine.json<object>())).toEqual(["subject", "displayName", "inboxId"]);
  expect(mine.json()).toMatchObject({ subject: "subject-a", displayName: "ana", inboxId: expect.any(String) });
  const theirs = await t.app.inject({ method: "GET", url: routes.me.path, headers: { cookie: friend } });
  expect(theirs.json()).toEqual({ subject: "subject-b", displayName: "bob", inboxId: null });
  expect((await t.app.inject({ method: "GET", url: routes.me.path })).statusCode).toBe(401);
});

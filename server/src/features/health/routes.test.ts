import { routes } from "@satchel/shared";
import { afterEach, beforeEach, expect, it } from "vitest";
import { routeSchemas } from "../../testing/routeSchemas.js";
import { startTestApp, type TestApp } from "../../testing/testApp.js";
import { healthRoutes } from "./routes.js";

let t: TestApp;

beforeEach(async () => {
  t = await startTestApp();
});

afterEach(async () => {
  await t.close();
});

it("declares the contract's response schema", async () => {
  expect(await routeSchemas(healthRoutes, {})).toEqual({
    [`GET ${routes.health.path}`]: { response: { 200: routes.health.response } },
  });
});

it("answers { ok: true } with no session, and HEAD with no body", async () => {
  const res = await t.app.inject({ method: "GET", url: routes.health.path });
  expect(res.statusCode).toBe(200);
  expect(res.body).toBe('{"ok":true}');
  const head = await t.app.inject({ method: "HEAD", url: routes.health.path });
  expect(head.statusCode).toBe(200);
  expect(head.body).toBe("");
});

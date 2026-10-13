import { describe, expect, it } from "vitest";
import { AUTH_BASE_PATH, returnToFor } from "./ward";

describe("AUTH_BASE_PATH", () => {
  it("is the plugin's routes under the API prefix the browser sees, where the cookie and Ward's callback live", () => {
    expect(AUTH_BASE_PATH).toBe("/satchel-api/auth");
  });
});

describe("returnToFor", () => {
  const base = "/satchel/";

  it("returns to the page the person was on, when it is under the app", () => {
    expect(returnToFor({ pathname: "/satchel/c/abc" }, base)).toBe("/satchel/c/abc");
    expect(returnToFor({ pathname: "/satchel/settings" }, base)).toBe("/satchel/settings");
  });

  it("falls back to the app's base for anything else", () => {
    expect(returnToFor({ pathname: "/elsewhere" }, base)).toBe(base);
    expect(returnToFor({ pathname: "//evil.example/satchel/" }, base)).toBe(base);
    expect(returnToFor({ pathname: "/satchel/a b" }, base)).toBe(base);
    expect(returnToFor({ pathname: `/satchel/${"x".repeat(600)}` }, base)).toBe(base);
  });
});

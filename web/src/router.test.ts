import { describe, expect, it } from "vitest";
import { matchRoute, pathFor, sameRoute, threadRoute, type Route } from "./router";

const BASE = "/satchel/";

describe("matchRoute", () => {
  it("matches the three routes", () => {
    expect(matchRoute("/satchel/", BASE)).toEqual({ name: "chats" });
    expect(matchRoute("/satchel", BASE)).toEqual({ name: "chats" });
    expect(matchRoute("/satchel/settings", BASE)).toEqual({ name: "settings" });
    expect(matchRoute("/satchel/settings/", BASE)).toEqual({ name: "settings" });
    expect(matchRoute("/satchel/new", BASE)).toEqual({ name: "new" });
    expect(matchRoute("/satchel/c/abc123", BASE)).toEqual({ name: "thread", id: "abc123" });
    expect(matchRoute("/satchel/c/abc123/", BASE)).toEqual({ name: "thread", id: "abc123" });
  });

  it("decodes the conversation id", () => {
    expect(matchRoute("/satchel/c/a%20b", BASE)).toEqual({ name: "thread", id: "a b" });
  });

  it("sends unknown paths to chats", () => {
    for (const path of [
      "/satchel/nope",
      "/satchel/c/",
      "/satchel/c",
      "/satchel/c/a/b",
      "/satchel/c/%E0%A4%A",
      "/satchel/c/%20",
      "/satchel/settings/extra",
      "/satchelx/settings",
      "/atrium/c/abc",
      "/",
    ]) {
      expect(matchRoute(path, BASE), path).toEqual({ name: "chats" });
    }
  });

  it("follows a different base", () => {
    expect(matchRoute("/", "/")).toEqual({ name: "chats" });
    expect(matchRoute("/c/x", "/")).toEqual({ name: "thread", id: "x" });
    expect(matchRoute("/apps/satchel/settings", "/apps/satchel/")).toEqual({ name: "settings" });
  });
});

describe("pathFor", () => {
  it("round-trips through matchRoute", () => {
    const routes: Route[] = [
      { name: "chats" },
      { name: "settings" },
      { name: "new" },
      threadRoute("abc"),
      threadRoute("with/slash and space"),
    ];
    for (const route of routes) {
      const path = pathFor(route, BASE);
      expect(path.startsWith(BASE)).toBe(true);
      expect(matchRoute(path, BASE)).toEqual(route);
    }
  });

  it("writes the canonical paths", () => {
    expect(pathFor({ name: "chats" }, BASE)).toBe("/satchel/");
    expect(pathFor({ name: "settings" }, BASE)).toBe("/satchel/settings");
    expect(pathFor(threadRoute("abc"), BASE)).toBe("/satchel/c/abc");
  });
});

describe("sameRoute", () => {
  it("compares names and thread ids", () => {
    expect(sameRoute(threadRoute("a"), threadRoute("a"))).toBe(true);
    expect(sameRoute(threadRoute("a"), threadRoute("b"))).toBe(false);
    expect(sameRoute({ name: "chats" }, { name: "settings" })).toBe(false);
  });
});

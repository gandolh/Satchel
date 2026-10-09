import { describe, expect, it } from "vitest";
import {
  clickPath,
  conversationPath,
  isShowingConversation,
  notificationFor,
  parsePushPayload,
  windowForClick,
} from "./notify";

const BASE = "/satchel/";
const ORIGIN = "https://gandolh.ro";

describe("parsePushPayload", () => {
  it("takes the server's payload", () => {
    expect(parsePushPayload({ conversationId: "c1", title: "ana", body: "hi", extra: 1 })).toEqual({
      conversationId: "c1",
      title: "ana",
      body: "hi",
    });
  });

  it.each([
    ["null", null],
    ["a string", "Test push message from DevTools."],
    ["no conversation", { title: "ana", body: "hi" }],
    ["an empty conversation", { conversationId: "", title: "ana", body: "hi" }],
    ["a numeric title", { conversationId: "c1", title: 1, body: "hi" }],
    ["no body", { conversationId: "c1", title: "ana" }],
  ])("refuses %s", (_label, data) => {
    expect(parsePushPayload(data)).toBeNull();
  });
});

describe("isShowingConversation", () => {
  const at = (path: string, focused: boolean) => ({ url: `${ORIGIN}${path}`, focused });

  it("is true only for a focused window on that thread", () => {
    expect(isShowingConversation([at("/satchel/c/c1", true)], BASE, "c1")).toBe(true);
    expect(isShowingConversation([at("/satchel/c/c1", false)], BASE, "c1")).toBe(false);
    expect(isShowingConversation([at("/satchel/c/c2", true)], BASE, "c1")).toBe(false);
    expect(isShowingConversation([at("/satchel/", true), at("/satchel/c/c1", false)], BASE, "c1")).toBe(false);
    expect(isShowingConversation([], BASE, "c1")).toBe(false);
  });

  it("matches the router's encoding of the id, and ignores a query or hash", () => {
    expect(conversationPath(BASE, "a b/c")).toBe("/satchel/c/a%20b%2Fc");
    expect(isShowingConversation([at("/satchel/c/a%20b%2Fc?x=1#y", true)], BASE, "a b/c")).toBe(true);
  });
});

describe("notificationFor", () => {
  it("tags by conversation, renotifies, and remembers where a click goes", () => {
    expect(notificationFor({ conversationId: "c1", title: "bob in Hike", body: "Lunch?" }, BASE)).toEqual({
      title: "bob in Hike",
      options: {
        body: "Lunch?",
        tag: "c1",
        renotify: true,
        icon: "/satchel/pwa-192x192.png",
        data: { conversationId: "c1", path: "/satchel/c/c1" },
      },
    });
  });
});

describe("clickPath", () => {
  it("uses the thread path from the data, and the app root for anything else", () => {
    expect(clickPath({ conversationId: "c1", path: "/satchel/c/c1" }, BASE)).toBe("/satchel/c/c1");
    expect(clickPath({ path: "https://evil.example/" }, BASE)).toBe(BASE);
    expect(clickPath(null, BASE)).toBe(BASE);
    expect(clickPath(undefined, BASE)).toBe(BASE);
  });
});

describe("windowForClick", () => {
  const win = (path: string, focused = false) => ({ url: `${ORIGIN}${path}`, focused, name: path });

  it("prefers a window already on the thread, then a focused one, then any in the app", () => {
    const list = [win("/satchel/"), win("/satchel/settings", true), win("/satchel/c/c1")];
    expect(windowForClick(list, BASE, "/satchel/c/c1")?.name).toBe("/satchel/c/c1");
    expect(windowForClick(list, BASE, "/satchel/c/c9")?.name).toBe("/satchel/settings");
    expect(windowForClick([win("/satchel/new")], BASE, "/satchel/c/c9")?.name).toBe("/satchel/new");
  });

  it("never picks a window outside the app, and gives null when there is none", () => {
    expect(windowForClick([win("/ward/login", true)], BASE, "/satchel/c/c1")).toBeNull();
    expect(windowForClick([], BASE, "/satchel/c/c1")).toBeNull();
  });
});

import { MAX_TEXT_LENGTH } from "@satchel/shared";
import { describe, expect, it } from "vitest";
import { canSend } from "../thread/model";
import {
  captureShare,
  clearDraft,
  createShareStash,
  draftFor,
  offerDraft,
  SHARE_STASH_KEY,
  shareMessage,
  sharedFields,
  type ShareCapturePlace,
} from "./share";

const BASE = "/satchel/";

describe("shareMessage", () => {
  it("puts the URL on its own line after the text", () => {
    expect(shareMessage({ text: "Read this", url: "https://example.com/a" })).toBe("Read this\nhttps://example.com/a");
  });

  it("doesn't repeat a URL the text already holds (Chrome on Android puts the link in text)", () => {
    expect(shareMessage({ title: "A page", text: "https://example.com/a", url: "" })).toBe("https://example.com/a");
    expect(shareMessage({ text: "See https://example.com/a now", url: "https://example.com/a" })).toBe(
      "See https://example.com/a now",
    );
  });

  it("uses the title only when there is no text", () => {
    expect(shareMessage({ title: "A page", text: "", url: "https://example.com/a" })).toBe(
      "A page\nhttps://example.com/a",
    );
    expect(shareMessage({ title: "A page", text: "Some text" })).toBe("Some text");
    expect(shareMessage({ title: "Only a title" })).toBe("Only a title");
  });

  it("takes a URL on its own", () => {
    expect(shareMessage({ url: "https://example.com/a" })).toBe("https://example.com/a");
  });

  it("trims the ends but keeps the lines inside", () => {
    expect(shareMessage({ text: "  one\ntwo  \n", url: " https://x.test " })).toBe("one\ntwo\nhttps://x.test");
  });

  it("is null when nothing was shared", () => {
    expect(shareMessage({})).toBeNull();
    expect(shareMessage({ title: " ", text: "\n", url: "" })).toBeNull();
    expect(shareMessage({ title: null, text: null, url: null })).toBeNull();
  });

  it("cuts nothing: an over-long share stays over the limit, so Send stays off", () => {
    const long = "x".repeat(MAX_TEXT_LENGTH + 10);
    const message = shareMessage({ text: long, url: "https://example.com" });
    expect(message).toBe(`${long}\nhttps://example.com`);
    expect(canSend(message ?? "")).toBe(false);
  });
});

describe("sharedFields", () => {
  it("reads the three params, decoded", () => {
    expect(sharedFields("?title=A%20page&text=hi+there&url=https%3A%2F%2Fx.test%2F%3Fq%3D1")).toEqual({
      title: "A page",
      text: "hi there",
      url: "https://x.test/?q=1",
    });
    expect(sharedFields("")).toEqual({ title: null, text: null, url: null });
  });
});

/** A sessionStorage stand-in. */
function memoryStorage(options: { throws?: boolean } = {}) {
  const items = new Map<string, string>();
  return {
    items,
    getItem(key: string) {
      if (options.throws) throw new Error("blocked");
      return items.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (options.throws) throw new Error("blocked");
      items.set(key, value);
    },
    removeItem(key: string) {
      if (options.throws) throw new Error("blocked");
      items.delete(key);
    },
  };
}

describe("createShareStash", () => {
  it("keeps a share in sessionStorage and hands it over once", () => {
    const storage = memoryStorage();
    const stash = createShareStash(storage);
    stash.put("hello");
    expect(storage.items.get(SHARE_STASH_KEY)).toBe("hello");
    expect(stash.take()).toBe("hello");
    expect(stash.take()).toBeNull();
    expect(storage.items.has(SHARE_STASH_KEY)).toBe(false);
  });

  it("finds a share kept before the page left for Ward and came back", () => {
    const storage = memoryStorage();
    createShareStash(storage).put("from before sign-in");
    // A fresh page load: a new stash over the same tab's storage.
    const after = createShareStash(storage);
    expect(after.take()).toBe("from before sign-in");
    expect(after.take()).toBeNull();
  });

  it("falls back to memory where storage throws", () => {
    const stash = createShareStash(memoryStorage({ throws: true }));
    stash.put("hello");
    expect(stash.take()).toBe("hello");
    expect(stash.take()).toBeNull();
  });

  it("works with no storage at all", () => {
    const stash = createShareStash(null);
    expect(stash.take()).toBeNull();
    stash.put("hello");
    expect(stash.take()).toBe("hello");
  });
});

function place(href: string, state: unknown = { satchelDepth: 0 }) {
  const url = new URL(href, "https://satchel.test");
  const calls: { state: unknown; path: string }[] = [];
  const at: ShareCapturePlace = {
    location: { pathname: url.pathname, search: url.search, hash: url.hash },
    history: {
      state,
      replaceState(nextState: unknown, _unused: string, path?: string | URL | null) {
        calls.push({ state: nextState, path: String(path) });
      },
    },
  };
  return { at, calls };
}

describe("captureShare", () => {
  it("keeps the shared text and drops the query from the address", () => {
    const kept: string[] = [];
    const { at, calls } = place("/satchel/share?title=T&text=hello&url=https%3A%2F%2Fx.test");
    captureShare(at, BASE, { put: (text) => kept.push(text) });
    expect(kept).toEqual(["hello\nhttps://x.test"]);
    expect(calls).toEqual([{ state: { satchelDepth: 0 }, path: "/satchel/share" }]);
  });

  it("follows the production base", () => {
    const kept: string[] = [];
    const { at, calls } = place("/share?text=hi");
    captureShare(at, "/", { put: (text) => kept.push(text) });
    expect(kept).toEqual(["hi"]);
    expect(calls.map((call) => call.path)).toEqual(["/share"]);
  });

  it("leaves an earlier share waiting when the share route comes back empty", () => {
    const kept: string[] = [];
    const { at, calls } = place("/satchel/share");
    captureShare(at, BASE, { put: (text) => kept.push(text) });
    expect(kept).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("does nothing on any other route, query or not", () => {
    for (const href of ["/satchel/?text=hi", "/satchel/c/abc?text=hi", "/satchel/settings", "/share?text=hi"]) {
      const kept: string[] = [];
      const { at, calls } = place(href);
      captureShare(at, BASE, { put: (text) => kept.push(text) });
      expect(kept, href).toEqual([]);
      expect(calls, href).toEqual([]);
    }
  });
});

describe("the composer draft", () => {
  it("goes to the inbox it was offered to, once", () => {
    offerDraft("inbox", "hello");
    expect(draftFor("other")).toBeUndefined();
    expect(draftFor("inbox")).toBe("hello");
    // Reading doesn't take it (a StrictMode double render reads twice).
    expect(draftFor("inbox")).toBe("hello");
    clearDraft("other");
    expect(draftFor("inbox")).toBe("hello");
    clearDraft("inbox");
    expect(draftFor("inbox")).toBeUndefined();
  });

  it("goes to whichever chat opens first when there is no inbox (a friend)", () => {
    offerDraft(null, "for a friend");
    expect(draftFor("chat-a")).toBe("for a friend");
    clearDraft("chat-a");
    expect(draftFor("chat-b")).toBeUndefined();
  });
});

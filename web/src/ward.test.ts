import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextPathFor, RENEW_EVERY_MS, startRenewal, wardLoginUrl } from "./ward";

const BASE = "/satchel/";

/** Ward's rules for `next` (its `ui/src/lib/next.ts`), as far as Satchel can break them. */
function expectBareSatchelPath(next: string): void {
  expect(next.startsWith("/")).toBe(true);
  expect(next.startsWith("//")).toBe(false);
  expect(next).not.toMatch(/[\\\s]/);
  expect(next).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
  expect(next.length).toBeLessThanOrEqual(512);
  expect(new URL(next, "https://ward.invalid").origin).toBe("https://ward.invalid");
  expect(next.startsWith(BASE)).toBe(true);
}

describe("nextPathFor", () => {
  it("keeps the current path when it is under the base", () => {
    expect(nextPathFor({ pathname: "/satchel/" }, BASE)).toBe("/satchel/");
    expect(nextPathFor({ pathname: "/satchel/c/abc" }, BASE)).toBe("/satchel/c/abc");
    expect(nextPathFor({ pathname: "/satchel/settings" }, BASE)).toBe("/satchel/settings");
  });

  it("falls back to the base for anything else", () => {
    for (const pathname of [
      "/satchel",
      "/",
      "/atrium/",
      "/satchelx/c/1",
      "//evil.example/satchel/",
      "/satchel/\\evil.example",
      "/satchel/a b",
      `/satchel/${"x".repeat(600)}`,
    ]) {
      expect(nextPathFor({ pathname }, BASE)).toBe(BASE);
    }
  });

  it("always yields a bare /satchel/ path", () => {
    for (const pathname of [
      "/satchel/c/abc",
      "/satchel/c/%2F%2Fevil.example",
      "https://evil.example/satchel/",
      "//evil.example",
      "/ward/login",
      "",
    ]) {
      expectBareSatchelPath(nextPathFor({ pathname }, BASE));
    }
  });

  describe("with the build's base", () => {
    beforeEach(() => {
      vi.stubEnv("BASE_URL", "/satchel/");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("defaults to import.meta.env.BASE_URL", () => {
      expect(nextPathFor({ pathname: "/elsewhere" })).toBe("/satchel/");
    });
  });
});

describe("wardLoginUrl", () => {
  it("points at Ward's login page with next encoded", () => {
    expect(wardLoginUrl("/satchel/c/abc")).toBe("/ward/login?next=%2Fsatchel%2Fc%2Fabc");
    const url = new URL(wardLoginUrl("/satchel/c/a&b?c"), "https://estate.example");
    expect(url.pathname).toBe("/ward/login");
    expect(url.searchParams.get("next")).toBe("/satchel/c/a&b?c");
  });
});

describe("startRenewal", () => {
  let visibility: DocumentVisibilityState;
  let onVisibilityChange: (() => void) | undefined;
  let refreshAnswer: number;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    refreshAnswer = 200;
    vi.stubGlobal("document", {
      get visibilityState() {
        return visibility;
      },
      addEventListener: (_type: string, listener: () => void) => {
        onVisibilityChange = listener;
      },
      removeEventListener: () => {
        onVisibilityChange = undefined;
      },
    });
    fetchMock = vi.fn(async () => new Response(null, { status: refreshAnswer }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renews every 12 minutes while visible, and at once when shown after longer", async () => {
    const signedOut = vi.fn();
    const stop = startRenewal(signedOut);

    await vi.advanceTimersByTimeAsync(RENEW_EVERY_MS - 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/ward-api/refresh", { method: "POST", credentials: "same-origin" });

    // Hidden: nothing, however long.
    visibility = "hidden";
    await vi.advanceTimersByTimeAsync(3 * RENEW_EVERY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Shown again after more than 12 minutes: renew straight away.
    visibility = "visible";
    onVisibilityChange?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signedOut).not.toHaveBeenCalled();

    // A refused renewal means the session is over.
    refreshAnswer = 401;
    await vi.advanceTimersByTimeAsync(RENEW_EVERY_MS + 60_000);
    expect(signedOut).toHaveBeenCalledTimes(1);

    stop();
    await vi.advanceTimersByTimeAsync(3 * RENEW_EVERY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = () => void;

/** The page the store writes to, in plain objects: the tests run in Node, with no DOM. */
function page(stored: string | null, system: "light" | "dark" = "dark") {
  const attributes = new Map<string, string>([
    ["color-scheme", ""],
    ["theme-color", ""],
  ]);
  const root = { dataset: {} as Record<string, string> };
  const data = new Map<string, string>(stored === null ? [] : [["theme", stored]]);
  const listeners = new Set<Listener>();
  let dark = system === "dark";
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  });
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return dark;
    },
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  }));
  // Reached as `window.matchMedia` by the store, so the stub has to be on window too.
  vi.stubGlobal("window", { matchMedia: (globalThis as { matchMedia: unknown }).matchMedia });
  vi.stubGlobal("document", {
    documentElement: root,
    querySelector: (selector: string) => {
      const name = /name="([^"]+)"/.exec(selector)?.[1] ?? "";
      return attributes.has(name) ? { setAttribute: (_a: string, v: string) => void attributes.set(name, v) } : null;
    },
  });
  return {
    attribute: () => root.dataset.theme,
    scheme: () => attributes.get("color-scheme"),
    bar: () => attributes.get("theme-color"),
    stored: () => data.get("theme"),
    setSystem(next: "light" | "dark") {
      dark = next === "dark";
      for (const listener of listeners) listener();
    },
  };
}

// The store reads the saved choice when its module loads, so each test loads it fresh, as a page load would.
async function load() {
  vi.resetModules();
  return import("./theme");
}

describe("the theme store", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("is light on a first visit, even when the system is dark", async () => {
    const p = page(null, "dark");
    const { THEME_COLOR } = await load();
    expect(p.attribute()).toBe("light");
    expect(p.scheme()).toBe("light");
    expect(p.bar()).toBe(THEME_COLOR.light);
  });

  it.each(["light", "dark", "system"] as const)("shows a stored %s on load", async (stored) => {
    const p = page(stored, "light");
    await load();
    expect(p.attribute()).toBe(stored);
  });

  it("is light when the stored value is not a theme", async () => {
    const p = page("sepia");
    await load();
    expect(p.attribute()).toBe("light");
  });

  it("is light when storage can't be read, and still takes a choice", async () => {
    const p = page(null);
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const { setTheme } = await load();
    expect(p.attribute()).toBe("light");
    setTheme("dark");
    expect(p.attribute()).toBe("dark");
  });

  it("choosing a theme sets the attribute, the two metas and the stored choice", async () => {
    const p = page(null, "light");
    const { setTheme, THEME_COLOR } = await load();
    setTheme("dark");
    expect(p.attribute()).toBe("dark");
    expect(p.scheme()).toBe("dark");
    expect(p.bar()).toBe(THEME_COLOR.dark);
    expect(p.stored()).toBe("dark");
    setTheme("light");
    expect(p.attribute()).toBe("light");
    expect(p.bar()).toBe(THEME_COLOR.light);
    expect(p.stored()).toBe("light");
  });

  it("System follows a changed system preference, in the bar's colour", async () => {
    const p = page("system", "light");
    const { THEME_COLOR } = await load();
    expect(p.attribute()).toBe("system");
    expect(p.scheme()).toBe("light dark");
    expect(p.bar()).toBe(THEME_COLOR.light);
    p.setSystem("dark");
    expect(p.bar()).toBe(THEME_COLOR.dark);
    p.setSystem("light");
    expect(p.bar()).toBe(THEME_COLOR.light);
  });

  it("leaves the bar alone on Light and Dark when the system changes", async () => {
    const p = page("light", "light");
    const { THEME_COLOR } = await load();
    p.setSystem("dark");
    expect(p.bar()).toBe(THEME_COLOR.light);
  });
});

describe("the accent, written three times", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

  it("is the same in the stylesheet's --color-accent, the boot script and THEME_COLOR", async () => {
    const css = /--color-accent:\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/i.exec(
      read("../styles/index.css"),
    );
    const script = /colors\s*=\s*\{\s*light:\s*"(#[0-9a-f]{6})",\s*dark:\s*"(#[0-9a-f]{6})"\s*\}/i.exec(
      read("../../index.html"),
    );
    const meta = /<meta name="theme-color" content="(#[0-9a-f]{6})"/i.exec(read("../../index.html"));
    expect(css).not.toBeNull();
    expect(script).not.toBeNull();
    const { THEME_COLOR } = await import("./theme");
    expect([css?.[1], css?.[2]]).toEqual([THEME_COLOR.light, THEME_COLOR.dark]);
    expect([script?.[1], script?.[2]]).toEqual([THEME_COLOR.light, THEME_COLOR.dark]);
    expect(meta?.[1]).toBe(THEME_COLOR.light);
  });

  it("is the manifest's theme_color too, in its light value", () => {
    const config = read("../../vite.config.ts");
    const light = /theme_color:\s*"(#[0-9a-f]{6})"/i.exec(config)?.[1];
    expect(light?.toLowerCase()).toBe("#9e4502");
  });
});

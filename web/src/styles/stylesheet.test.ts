import { describe, expect, it } from "vitest";
import { WIDE_QUERY } from "../polling";
import css from "./index.css?inline";

// The page's one stylesheet as the Vite plugin builds it (vitest runs the same plugin). Tailwind scans the sources
// for class names, this file included, so these names are in its input: what is absent below is absent because the
// theme has no such name, not because nothing asked for it.
const FIXTURE = {
  cleared: ["bg-red-500", "text-sm", "rounded-xl", "shadow-md", "max-w-lg", "md:flex", "font-sans"],
  tokens: [
    "bg-surface",
    "text-muted",
    "text-small",
    "text-hero",
    "rounded-pill",
    "shadow-lift",
    "w-list",
    "font-title",
  ],
};

/** A class selector for a utility, so `text-sm` is not found inside `text-small`. */
function selector(name: string): RegExp {
  return new RegExp(`\\.${name.replace(":", "\\\\:")}(?![\\w-])`);
}

/** Every rule whose selector list names `html` or `:root`, with its declarations. */
function rootRules(): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => (selectors ?? "").split(",").some((s) => ["html", ":root"].includes(s.trim())))
    .map(([, , body]) => body ?? "");
}

describe("styles/index.css", () => {
  it("generates nothing for Tailwind's cleared default scales", () => {
    for (const name of FIXTURE.cleared) expect(css, name).not.toMatch(selector(name));
  });

  it("generates the app's colour, type, radius, shadow, width and font tokens", () => {
    for (const name of FIXTURE.tokens) expect(css, name).toMatch(selector(name));
  });

  it("keeps the 900px breakpoint in step with WIDE_QUERY, which the shell reads in JavaScript", () => {
    const px = /--breakpoint-wide:\s*(\d+)px/.exec(css)?.[1];
    expect(px).toBeDefined();
    expect(WIDE_QUERY).toBe(`(min-width: ${px}px)`);
  });

  it("keeps the 16px on body and leaves the root at the browser's size", () => {
    expect(css).toMatch(/--text-body:\s*1rem/);
    expect(css).toMatch(/body\s*\{[^}]*font-size:\s*var\(--text-body\)/);
    for (const body of rootRules()) expect(body).not.toMatch(/(^|;|\s)font-size:/);
  });
});

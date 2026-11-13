import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Contrast over the tokens in styles/index.css, both themes: every text pair clears 4.5:1 and every icon, edge and focus
 * pair clears 3:1 (WCAG 2.2, 1.4.3 and 1.4.11). Each pair is a foreground token on a background token that the screens
 * really put together.
 */
const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");

const TOKENS = new Map<string, [string, string]>();
for (const match of css.matchAll(/--color-([\w-]+):\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/gi)) {
  const [, name, light, dark] = match;
  if (name && light && dark) TOKENS.set(name, [light, dark]);
}

function channel(hex: string, at: number): number {
  const value = parseInt(hex.slice(at, at + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** [foreground, background] pairs. */
const TEXT: [string, string][] = [
  ...["bg", "surface", "sunk", "control", "control-hover", "row-hover", "bubble-in", "ok-soft", "accent-soft"].map(
    (bg): [string, string] => ["ink", bg],
  ),
  ...["surface", "row-hover", "control", "ok-soft", "bg"].map((bg): [string, string] => ["ink-2", bg]),
  ...["bg", "control", "surface", "sunk", "row-hover", "ok-soft", "bubble-in", "accent-soft"].map(
    (bg): [string, string] => ["muted", bg],
  ),
  ...["surface", "bg", "row-hover", "control", "ok-soft", "bubble-in"].map((bg): [string, string] => ["accent", bg]),
  ["accent-press", "surface"],
  ["accent-ink", "accent"],
  ["accent-ink", "accent-press"],
  ["on-accent-soft", "accent-soft"],
  ["on-sent", "sent"],
  ["on-sent-meta", "sent"],
  ["on-ok", "ok"],
  ["on-ok-soft", "ok-soft"],
  ...["bg", "surface", "sunk"].map((bg): [string, string] => ["bad", bg]),
  ["on-rail", "rail"],
  ["on-rail-current", "rail-current"],
];

const PARTS: [string, string][] = [
  ...["sunk", "surface", "bg", "accent-soft"].map((bg): [string, string] => ["outline", bg]),
  ["accent", "surface"],
  ["accent", "bg"],
  ["accent-ink", "accent"],
  ["ok", "surface"],
  ["bad", "bg"],
  ...["bg", "surface", "sunk", "control", "ok-soft"].map((bg): [string, string] => ["focus", bg]),
  ["focus-rail", "rail"],
];

function measure(pairs: [string, string][], theme: 0 | 1): { pair: string; value: number }[] {
  return pairs.map(([fg, bg]) => {
    const front = TOKENS.get(fg)?.[theme];
    const back = TOKENS.get(bg)?.[theme];
    if (!front || !back) throw new Error(`No token for ${fg} on ${bg}`);
    return { pair: `${fg} on ${bg}`, value: ratio(front, back) };
  });
}

describe("contrast of the tokens", () => {
  for (const [theme, name] of [
    [0, "light"],
    [1, "dark"],
  ] as const) {
    it(`clears 4.5:1 for text and 3:1 for icons, edges and rings, ${name}`, () => {
      const failing = [
        ...measure(TEXT, theme).filter((m) => m.value < 4.5),
        ...measure(PARTS, theme).filter((m) => m.value < 3),
      ];
      expect(failing).toEqual([]);
    });
  }

  it("reads every token it names", () => {
    expect(TOKENS.size).toBeGreaterThan(30);
  });
});

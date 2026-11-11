import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge, told this app's @theme names (styles/index.css). Without the `text` list it reads `text-body` as a
 * colour, so `cn("text-body", "text-ink")` would drop one of the two. Keep the lists in step with @theme.
 *
 * The app's sizes carry no line height (each element inherits body's), so a size must not remove a `leading-*`, which
 * tailwind-merge does by default: `cn("leading-tight", "text-meta")` would lose the `leading-tight`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "tiny", "small", "meta", "compact", "body", "input", "title", "heading", "display", "hero"],
      radius: ["box", "pill"],
      shadow: ["thumb", "lift"],
      font: ["title", "body", "mono"],
    },
    classGroups: {
      w: [{ w: ["list"] }],
      h: [{ h: ["bar"] }],
      "min-h": [{ "min-h": ["bar"] }],
    },
  },
  override: {
    conflictingClassGroups: { "font-size": [] },
  },
});

/** Joins class names, and lets a later class win over an earlier one it conflicts with. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

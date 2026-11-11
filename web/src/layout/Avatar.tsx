import { CLAUDE_DISPLAY_NAME } from "@satchel/shared";
import { cn } from "../lib/cn";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

/** Up to two letters: the first two words' initials, or a single word's first two letters. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s._-]+/u)
    .filter(Boolean);
  const [first = "", second = ""] = words;
  const letters = second ? [...first].slice(0, 1).concat([...second].slice(0, 1)) : [...first].slice(0, 2);
  return letters.join("").toLocaleUpperCase() || "?";
}

/** Box and letter size per avatar size. The extra-small letter runs 9 px in the old CSS; it is the scale's 10 now. */
const SIZES: Record<AvatarSize, string> = {
  xs: "size-4 text-micro tracking-normal",
  sm: "size-9 text-body",
  md: "size-12 text-title",
  lg: "size-14 text-heading",
};

/** Claude's "C" is set a step larger than a person's initials. */
const CLAUDE_SIZES: Record<AvatarSize, string> = {
  xs: "text-micro",
  sm: "text-title",
  md: "text-display",
  lg: "text-display",
};

/**
 * A round avatar with initials. `claude` is Claude's: a green circle with "C"
 * (design.md). Sizes: xs 16px (seen line), sm 36px (thread header), md 48px
 * (chat rows), lg 56px (Settings).
 */
export function Avatar({ name, claude = false, size = "md" }: { name: string; claude?: boolean; size?: AvatarSize }) {
  return (
    <span
      className={cn(
        "inline-grid flex-none place-items-center rounded-pill bg-sunk font-title font-semibold tracking-[0.02em] text-ink select-none",
        SIZES[size],
        claude && ["bg-ok font-bold text-surface", CLAUDE_SIZES[size]],
      )}
      aria-hidden="true"
    >
      {claude ? CLAUDE_DISPLAY_NAME.charAt(0) : initials(name)}
    </span>
  );
}

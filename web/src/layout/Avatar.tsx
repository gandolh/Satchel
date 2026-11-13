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

/** Box and letter size per avatar size. */
const SIZES: Record<AvatarSize, string> = {
  xs: "size-5 text-small font-semibold tracking-normal",
  sm: "size-10 text-compact",
  md: "size-12 text-input",
  lg: "size-14 text-heading",
};

/** Claude's "C" is set a step larger than a person's initials. */
const CLAUDE_SIZES: Record<AvatarSize, string> = {
  xs: "text-small",
  sm: "text-input",
  md: "text-heading",
  lg: "text-heading",
};

/**
 * A round avatar with initials. `claude` is Claude's: a green circle with "C"
 * (design.md). Sizes: xs 20px (seen line), sm 40px (thread header, people), md 48px
 * (chat rows), lg 56px (Settings).
 */
export function Avatar({
  name,
  claude = false,
  size = "md",
  className,
}: {
  name: string;
  claude?: boolean;
  size?: AvatarSize;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-grid flex-none place-items-center rounded-pill bg-control font-title leading-none font-bold tracking-[0.02em] text-ink select-none",
        SIZES[size],
        claude && ["bg-ok text-on-ok", CLAUDE_SIZES[size]],
        className,
      )}
      aria-hidden="true"
    >
      {claude ? CLAUDE_DISPLAY_NAME.charAt(0) : initials(name)}
    </span>
  );
}

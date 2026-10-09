import { CLAUDE_DISPLAY_NAME } from "@satchel/shared";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

/** Up to two letters: the first two words' initials, or a single word's first two letters. */
export function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/u).filter(Boolean);
  const [first = "", second = ""] = words;
  const letters = second ? [...first].slice(0, 1).concat([...second].slice(0, 1)) : [...first].slice(0, 2);
  return letters.join("").toLocaleUpperCase() || "?";
}

/**
 * A round avatar with initials. `claude` is Claude's: a green circle with "C"
 * (design.md). Sizes: xs 16px (seen line), sm 36px (thread header), md 48px
 * (chat rows), lg 56px (Settings).
 */
export function Avatar({ name, claude = false, size = "md" }: { name: string; claude?: boolean; size?: AvatarSize }) {
  const className = ["avatar", size === "md" ? "" : `avatar--${size}`, claude ? "avatar--claude" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={className} aria-hidden="true">
      {claude ? CLAUDE_DISPLAY_NAME.charAt(0) : initials(name)}
    </span>
  );
}

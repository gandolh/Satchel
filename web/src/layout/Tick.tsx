import type { TickState } from "@satchel/shared";
import { cn } from "../lib/cn";

/**
 * One tick when sent, two when everyone else has seen it (design.md, "Message states"). On the accent bubble
 * (`onAccent`) both read in the bubble's text colour, the sent one faded.
 */
export function Tick({ state, onAccent = false }: { state: TickState; onAccent?: boolean }) {
  const seen = state === "seen";
  return (
    <span
      className={cn(
        "mr-0.75 flex-none pr-0.75 text-small tracking-[-3px]",
        seen ? "text-accent" : "text-muted",
        onAccent && ["text-accent-ink", seen ? "font-bold opacity-100" : "opacity-70"],
      )}
      role="img"
      aria-label={seen ? "Seen" : "Sent"}
    >
      {seen ? "✓✓" : "✓"}
    </span>
  );
}

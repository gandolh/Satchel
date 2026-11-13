import type { TickState } from "@satchel/shared";
import { cn } from "../lib/cn";

/**
 * One tick when sent, two when everyone else has seen it (design.md, "Message states"): the count says the state, never
 * the colour. On a bubble (`onAccent`) the icon takes the bubble's meta colour; on its own it is muted. Spoken as "Sent" or "Seen".
 */
export function Tick({ state, onAccent = false }: { state: TickState; onAccent?: boolean }) {
  const seen = state === "seen";
  return (
    <span
      className={cn("inline-flex flex-none", !onAccent && "text-muted")}
      role="img"
      aria-label={seen ? "Seen" : "Sent"}
    >
      <svg
        className={seen ? "h-3.5 w-4.5" : "size-3.5"}
        viewBox={seen ? "0 0 28 24" : "0 0 24 24"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d={seen ? "M3 12.5l4.5 4.5L17 7.5M13.5 15.5l1.5 1.5L25 7.5" : "M5 12.5l4.5 4.5L19 7.5"} />
      </svg>
    </span>
  );
}

import type { TickState } from "@satchel/shared";

/** One tick when sent, two when everyone else has seen it (design.md, "Message states"). */
export function Tick({ state }: { state: TickState }) {
  const seen = state === "seen";
  return (
    <span className={seen ? "tick tick--seen" : "tick"} role="img" aria-label={seen ? "Seen" : "Sent"}>
      {seen ? "✓✓" : "✓"}
    </span>
  );
}

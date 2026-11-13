import { cn } from "../lib/cn";

/** The brand mark: an "S" on the clay, 56 px on the gate and in the empty pane; the rail sets it to 40. */
export function Mark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-grid size-14 place-items-center rounded-bubble bg-accent font-title text-hero leading-none font-bold text-accent-ink select-none",
        className,
      )}
      aria-hidden="true"
    >
      S
    </span>
  );
}

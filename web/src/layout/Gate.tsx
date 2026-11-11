import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Mark } from "./Mark";

/** The full-screen centre the signed-out pages share: the mark, a title, and what the page has to say. */
export function Gate({
  title,
  busy = false,
  className,
  children,
}: {
  /** Shown as the page title; without one the heading stays for screen readers only. */
  title?: string;
  busy?: boolean;
  /** Extra classes for the panel. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <main
      className="grid min-h-dvh place-items-center px-4 pt-[max(--spacing(8),env(safe-area-inset-top,0px))] pb-8"
      aria-busy={busy || undefined}
    >
      <div className={cn("grid max-w-[360px] justify-items-center gap-4 text-center", className)}>
        <Mark />
        <h1 className={title ? "text-display font-bold" : "sr-only"}>{title ?? "Satchel"}</h1>
        {children}
      </div>
    </main>
  );
}

/** A line of text on a gate: loading, a notice, an explanation. */
export function GateMessage({ children, role }: { children: ReactNode; role?: "alert" | "status" }) {
  return (
    <p className="text-input text-pretty text-muted" role={role}>
      {children}
    </p>
  );
}

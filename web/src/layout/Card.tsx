import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export interface CardProps extends Omit<ComponentProps<"section">, "title"> {
  /** The card's heading; it names the section for a screen reader. */
  title: string;
  /** The heading's id, which the section's `aria-labelledby` points at. */
  titleId: string;
}

/** A bordered card with a heading: the unit Settings is made of. */
export function Card({ title, titleId, className, children, ...props }: CardProps) {
  return (
    <section
      {...props}
      aria-labelledby={titleId}
      className={cn("grid gap-4 rounded-bubble border border-line bg-surface p-4", className)}
    >
      <h3 className="text-input font-semibold" id={titleId}>
        {title}
      </h3>
      {children}
    </section>
  );
}

import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

const VARIANTS = {
  primary: "border-transparent bg-accent text-accent-ink hover:bg-accent-press",
  quiet: "border-transparent bg-control text-ink hover:bg-control-hover",
  danger: "border-line bg-surface text-bad hover:bg-sunk",
} as const;

export interface ButtonProps extends Omit<ComponentProps<typeof BaseButton>, "className"> {
  /** The clay pill (the default), the secondary pill on the control tone, or the outlined one in the error colour. */
  variant?: keyof typeof VARIANTS;
  className?: string;
}

/** The pill button: Base UI's Button, with the app's three looks. A disabled one is a pale clay wash with muted text. */
export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <BaseButton
      {...props}
      className={cn(
        "relative inline-flex min-h-10 items-center justify-center gap-2 rounded-pill border px-5 text-compact font-semibold no-underline",
        "after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
        "motion-safe:transition-colors motion-safe:duration-120",
        "data-disabled:cursor-default data-disabled:border-transparent data-disabled:bg-accent-soft data-disabled:text-muted data-disabled:hover:bg-accent-soft",
        VARIANTS[variant],
        className,
      )}
    />
  );
}

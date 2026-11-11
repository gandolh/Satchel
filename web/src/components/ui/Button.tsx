import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

const VARIANTS = {
  primary: "border-transparent bg-accent text-accent-ink hover:bg-accent-press",
  quiet: "border-line bg-surface text-ink hover:bg-sunk",
  danger: "border-line bg-surface text-bad hover:bg-sunk",
} as const;

export interface ButtonProps extends Omit<ComponentProps<typeof BaseButton>, "className"> {
  /** The accent pill (the default), the outlined one, or the outlined one in the error colour. */
  variant?: keyof typeof VARIANTS;
  className?: string;
}

/** The pill button: Base UI's Button, with the app's three looks. A disabled one keeps the pointer but fades. */
export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <BaseButton
      {...props}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border px-6 font-semibold no-underline",
        "data-disabled:cursor-default data-disabled:opacity-60",
        VARIANTS[variant],
        className,
      )}
    />
  );
}

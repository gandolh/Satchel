import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { cn } from "../../lib/cn";

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-describedby"?: string;
  className?: string;
};

/** A switch: Base UI's `Switch.Root` with its thumb. Wrap it in a `<label>` at the call site. */
export function Switch({ className, ...props }: SwitchProps) {
  return (
    <BaseSwitch.Root
      className={cn(
        "relative m-0 inline-block h-7 w-12 flex-none cursor-pointer rounded-pill border-2 border-outline bg-surface",
        "data-checked:border-accent data-checked:bg-accent data-disabled:cursor-default data-disabled:opacity-50",
        "motion-safe:transition-[background-color,border-color] motion-safe:duration-120",
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb
        className={cn(
          "absolute top-0.5 left-0.5 size-5 rounded-pill bg-outline",
          "data-checked:translate-x-5 data-checked:bg-accent-ink motion-safe:transition-transform motion-safe:duration-120",
        )}
      />
    </BaseSwitch.Root>
  );
}

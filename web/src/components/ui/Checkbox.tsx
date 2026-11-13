import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { CheckIcon } from "../../layout/icons";
import { cn } from "../../lib/cn";

type CheckboxProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

/** A checkbox: Base UI's `Checkbox.Root` with its tick. Wrap it in a `<label>` at the call site. */
export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <BaseCheckbox.Root
      className={cn(
        "inline-flex size-6 flex-none items-center justify-center rounded-sm border-2 border-outline bg-surface text-accent-ink",
        "data-checked:border-accent data-checked:bg-accent data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <BaseCheckbox.Indicator className="flex [&_svg]:size-4">
        <CheckIcon />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}

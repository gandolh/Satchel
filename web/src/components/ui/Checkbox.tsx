import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { CheckIcon } from "../../layout/icons";

type CheckboxProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

/** A checkbox: Base UI's `Checkbox.Root` with its tick. Wrap it in a `<label>` at the call site. */
export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <BaseCheckbox.Root className={className ? `checkbox ${className}` : "checkbox"} {...props}>
      <BaseCheckbox.Indicator className="checkbox__tick">
        <CheckIcon />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}

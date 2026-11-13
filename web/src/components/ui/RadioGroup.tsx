import { Radio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { useId, type ReactNode } from "react";

interface RadioOption<Value extends string> {
  value: Value;
  label: ReactNode;
}

export interface RadioGroupProps<Value extends string> {
  /** The group's name for screen readers, shown above the choices. */
  label: string;
  options: readonly RadioOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
}

/**
 * One choice from a few, as radios with dots. Tab enters the group, and the arrow keys move and choose (base-ui
 * rule 16): for a setting kept on the device, never one that saves to the server.
 */
export function RadioGroup<Value extends string>({ label, options, value, onValueChange }: RadioGroupProps<Value>) {
  const labelId = useId();
  return (
    <div className="grid gap-2">
      <div id={labelId} className="font-semibold">
        {label}
      </div>
      <BaseRadioGroup<Value>
        aria-labelledby={labelId}
        value={value}
        onValueChange={onValueChange}
        className="grid gap-1"
      >
        {options.map((option) => (
          <label key={option.value} className="flex min-h-12 cursor-pointer items-center gap-3">
            <Radio.Root
              value={option.value}
              className="grid size-5 flex-none place-items-center rounded-pill border-2 border-outline bg-surface data-checked:border-accent"
            >
              <Radio.Indicator className="size-2.5 rounded-pill bg-accent" />
            </Radio.Root>
            {option.label}
          </label>
        ))}
      </BaseRadioGroup>
    </div>
  );
}

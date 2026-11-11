import { Switch as BaseSwitch } from "@base-ui/react/switch";

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
    <BaseSwitch.Root className={className ? `switch ${className}` : "switch"} {...props}>
      <BaseSwitch.Thumb className="switch__thumb" />
    </BaseSwitch.Root>
  );
}

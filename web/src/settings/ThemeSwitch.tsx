import { RadioGroup } from "../components/ui/RadioGroup";
import { Card } from "../layout/Card";
import { setTheme, useTheme, type Theme } from "./theme";

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

/** Light, Dark or System, kept on this device. A RadioGroup: nothing goes to the server (base-ui rule 16). */
export function ThemeSwitch() {
  return (
    <Card title="Appearance" titleId="settings-appearance">
      <RadioGroup<Theme> label="Theme" options={THEMES} value={useTheme()} onValueChange={setTheme} />
    </Card>
  );
}

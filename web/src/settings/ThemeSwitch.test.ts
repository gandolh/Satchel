import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RadioGroup } from "../components/ui/RadioGroup";

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

const render = (value: "light" | "dark" | "system") =>
  renderToStaticMarkup(createElement(RadioGroup, { label: "Theme", options: OPTIONS, value, onValueChange: () => {} }));

describe("the theme choice (a RadioGroup)", () => {
  it("is a group named Theme with the three choices", () => {
    const html = render("light");
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain(">Theme<");
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    for (const name of ["Light", "Dark", "System"]) expect(html).toContain(`>${name}<`);
  });

  it("checks the chosen one", () => {
    for (const [index, value] of (["light", "dark", "system"] as const).entries()) {
      const radios = [...render(value).matchAll(/role="radio"[^>]*aria-checked="(true|false)"/g)].map((m) => m[1]);
      expect(radios[index]).toBe("true");
      expect(radios.filter((c) => c === "true")).toHaveLength(1);
    }
  });
});

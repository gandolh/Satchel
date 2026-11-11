import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Checkbox } from "./Checkbox";

const render = (props: { checked: boolean; disabled?: boolean }) =>
  renderToStaticMarkup(createElement(Checkbox, { onCheckedChange: () => {}, ...props }));

describe("Checkbox", () => {
  it("is a checkbox with its state in aria-checked", () => {
    expect(render({ checked: false })).toContain('role="checkbox"');
    expect(render({ checked: false })).toContain('aria-checked="false"');
    expect(render({ checked: true })).toContain('aria-checked="true"');
  });

  it("can be disabled", () => {
    expect(render({ checked: false, disabled: true })).toContain('disabled=""');
  });
});

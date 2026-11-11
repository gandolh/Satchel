import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Switch } from "./Switch";

const render = (props: { checked: boolean; disabled?: boolean }) =>
  renderToStaticMarkup(createElement(Switch, { onCheckedChange: () => {}, ...props }));

describe("Switch", () => {
  it("is a switch with its state in aria-checked", () => {
    expect(render({ checked: false })).toContain('role="switch"');
    expect(render({ checked: false })).toContain('aria-checked="false"');
    expect(render({ checked: true })).toContain('aria-checked="true"');
  });

  it("can be disabled", () => {
    expect(render({ checked: false, disabled: true })).toContain('disabled=""');
    expect(render({ checked: false })).not.toContain('disabled=""');
  });
});

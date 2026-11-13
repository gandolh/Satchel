import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("keeps a named size beside a colour", () => {
    expect(cn("text-ink", "text-body")).toBe("text-ink text-body");
    expect(cn("text-body", "text-muted")).toBe("text-body text-muted");
  });

  it("lets a later size, colour, radius, shadow or font replace an earlier one", () => {
    expect(cn("text-small", "text-compact")).toBe("text-compact");
    expect(cn("text-ink", "text-muted")).toBe("text-muted");
    expect(cn("rounded-md", "rounded-pill")).toBe("rounded-pill");
    expect(cn("rounded-pill", "rounded-bubble")).toBe("rounded-bubble");
    expect(cn("shadow-float", "shadow-none")).toBe("shadow-none");
    expect(cn("font-title", "font-body")).toBe("font-body");
  });

  it("keeps a leading beside a size, in either order", () => {
    expect(cn("leading-5", "text-compact")).toBe("leading-5 text-compact");
    expect(cn("text-compact", "leading-5")).toBe("text-compact leading-5");
  });

  it("tells a size from a weight and a font", () => {
    expect(cn("text-body", "font-semibold", "font-title")).toBe("text-body font-semibold font-title");
  });

  it("treats the named width and heights as their own", () => {
    expect(cn("w-list", "w-full")).toBe("w-full");
    expect(cn("w-list", "min-h-bar")).toBe("w-list min-h-bar");
    expect(cn("min-h-bar", "min-h-11")).toBe("min-h-11");
  });

  it("drops falsy values", () => {
    expect(cn("p-2", false, undefined, null, "m-1")).toBe("p-2 m-1");
  });
});

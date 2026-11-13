import { expect, test } from "@playwright/test";
import { stubApi } from "./fixtures";

/**
 * The layout switch at 900 px: under it the tab bar and the New chat button, from it the rail and the pencil in the
 * list header. `--breakpoint-wide` and WIDE_QUERY are equal, and a unit test keeps them so.
 */
for (const width of [899, 900, 901]) {
  test(`${width} px shows the ${width < 900 ? "tab bar" : "rail"}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await stubApi(page);
    await page.goto("/satchel/");
    await page.getByRole("heading", { name: "Chats", level: 1 }).waitFor();
    const main = page.getByRole("navigation", { name: "Main" });
    await expect(main).toHaveCount(1);
    const box = await main.boundingBox();
    const newChat = page.getByRole("link", { name: "New chat" });
    await expect(newChat).toHaveCount(1);
    const pencil = await newChat.boundingBox();
    if (width < 900) {
      // The tab bar runs along the bottom; the New chat button floats above it at the right.
      expect(box?.width).toBe(width);
      expect(box?.y ?? 0).toBeGreaterThan(600);
      expect(pencil?.width).toBe(56);
      expect(pencil?.height).toBe(56);
      expect((pencil?.y ?? 0) + 56 + 16).toBeLessThanOrEqual(box?.y ?? 0);
      expect((pencil?.x ?? 0) + 56 + 16).toBeCloseTo(width, 0);
    } else {
      // The rail is 72 px and runs the full height at the left; the pencil sits in the list header.
      expect(box?.x).toBe(0);
      expect(box?.width).toBe(72);
      expect(box?.height).toBe(800);
      expect(pencil?.y ?? 999).toBeLessThan(80);
      expect(pencil?.width).toBeLessThan(56);
    }
  });
}

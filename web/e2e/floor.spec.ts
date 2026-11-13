import { expect, test, type Page } from "@playwright/test";
import { stubApi } from "./fixtures";
import { SCREENS, type Screen } from "./screens";

/**
 * The Floor, screen by screen and theme by theme: every keyboard stop shows a focus ring, nothing moves under reduced
 * motion, and a 390 px phone never scrolls sideways. "system" follows the operating system, which the test sets dark.
 */
const THEMES = ["light", "dark", "system"] as const;
type Theme = (typeof THEMES)[number];

async function open(page: Page, screen: Screen, theme: Theme) {
  await page.emulateMedia({ colorScheme: theme === "light" ? "light" : "dark" });
  await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
  await stubApi(page, screen.stubs);
  await page.goto(screen.path);
  await page.waitForTimeout(400);
  await screen.act?.(page);
  await page.waitForTimeout(200);
}

for (const theme of THEMES) {
  for (const screen of SCREENS) {
    test.describe(`${screen.name}, ${theme}`, () => {
      test("every Tab stop shows a visible focus ring", async ({ page }) => {
        await open(page, screen, theme);
        let stops = 0;
        for (let step = 0; step < 40; step += 1) {
          await page.keyboard.press("Tab");
          const stop = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            if (el.hasAttribute("data-visited")) return "again" as const;
            el.setAttribute("data-visited", "");
            const style = getComputedStyle(el);
            const label = `${el.tagName} ${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? ""}`;
            return {
              label,
              style: style.outlineStyle,
              width: parseFloat(style.outlineWidth),
              color: style.outlineColor,
            };
          });
          if (stop === "again") break;
          if (stop === null) continue;
          stops += 1;
          expect(stop.style, `${stop.label} has an outline`).not.toBe("none");
          expect(stop.width, `${stop.label} outline width`).toBeGreaterThanOrEqual(2);
          expect(stop.color, `${stop.label} outline colour`).not.toBe("rgba(0, 0, 0, 0)");
        }
        // The gate's loading screen has nothing to focus; every other screen has a stop.
        if (screen.name !== "gate-loading" && screen.name !== "list-loading") {
          expect(stops, "the screen has keyboard stops").toBeGreaterThan(0);
        }
      });

      test("nothing runs under reduced motion", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await open(page, screen, theme);
        const moving = await page.evaluate(() => {
          const running = document.getAnimations().filter((animation) => animation.playState === "running");
          const timed = [...document.querySelectorAll("*")].filter((el) => {
            const style = getComputedStyle(el);
            const transition = style.transitionDuration.split(",").some((value) => parseFloat(value) > 0.001);
            const animation = style.animationName !== "none" && parseFloat(style.animationDuration) > 0.001;
            return transition || animation;
          });
          return { running: running.length, timed: timed.map((el) => `${el.tagName}.${el.className}`).slice(0, 5) };
        });
        expect(moving).toEqual({ running: 0, timed: [] });
      });

      test("390 px has no sideways scroll", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await open(page, screen, theme);
        const widths = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          inner: window.innerWidth,
        }));
        expect(widths.scroll).toBeLessThanOrEqual(widths.inner);
      });
    });
  }
}

import { expect, test } from "@playwright/test";
import { stubApi } from "./fixtures";

/** The Light / Dark / System switch: light on a first visit even when the system is dark, then the choice sticks. */
const page_ = (colour: string) => `rgb(${colour})`;

test("a first visit is light, even when the system is dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await stubApi(page);
  await page.goto("/satchel/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe(page_("240, 243, 246"));
});

test("the switch moves between Light, Dark and System and keeps the choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await stubApi(page);
  await page.goto("/satchel/settings");
  const body = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await body()).toBe(page_("16, 20, 25"));

  await page.getByRole("radio", { name: "System" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  expect(await body()).toBe(page_("240, 243, 246"));
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await body()).toBe(page_("16, 20, 25"));

  await page.getByRole("radio", { name: "Light" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await body()).toBe(page_("240, 243, 246"));
});

test("the browser bar takes the clay in each theme", async ({ page }) => {
  await stubApi(page);
  await page.goto("/satchel/settings");
  const bar = () => page.locator('meta[name="theme-color"]').getAttribute("content");
  expect(await bar()).toBe("#9e4502");
  await page.getByRole("radio", { name: "Dark" }).click();
  expect(await bar()).toBe("#eb9c6a");
});

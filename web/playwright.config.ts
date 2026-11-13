import { defineConfig } from "@playwright/test";

// The specs run against the Vite dev server with the API answered by stubs (e2e/fixtures.ts), so no Satchel server and
// no Ward run. Port 5190 is not the dev port (5175), so a `npm run dev` beside it doesn't clash. `CHROME` points at an
// installed Chrome when Playwright's own browser isn't downloaded.
export default defineConfig({
  testDir: "e2e",
  workers: 2,
  use: {
    locale: "en-GB",
    timezoneId: "UTC",
    baseURL: "http://127.0.0.1:5190",
    launchOptions: { executablePath: process.env["CHROME"] },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5190 --strictPort",
    url: "http://127.0.0.1:5190/satchel/",
    reuseExistingServer: false,
    env: { SATCHEL_BASE: "/satchel/" },
  },
});

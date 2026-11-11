import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// One Vitest project at the root. `forks` because better-sqlite3 is
// a native addon, and process isolation keeps tests from sharing one instance.
// The Tailwind plugin and `css.include` let a test import the page's stylesheet as the build makes it
// (`import css from "./index.css?inline"`); vitest skips CSS files otherwise.
export default defineConfig({
  plugins: [tailwindcss()],
  test: {
    include: ["*/src/**/*.test.{ts,tsx}"],
    pool: "forks",
    css: { include: [/\.css\?inline$/] },
  },
});

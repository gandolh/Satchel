import { defineConfig } from "vitest/config";

// One Vitest project at the root. `forks` because better-sqlite3 (brief 03) is
// a native addon, and process isolation keeps tests from sharing one instance.
export default defineConfig({
  test: {
    include: ["*/src/**/*.test.{ts,tsx}"],
    pool: "forks",
  },
});

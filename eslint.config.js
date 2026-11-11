import { houseStyle } from "./vendor/house-style/eslint.config.js";

/**
 * The house config from the vendored house-style copy, given Satchel's folders. Thin on purpose: the
 * compiler is the first gate, and the house adds only what it cannot see. The rules and the reason
 * for each are in the copy.
 */
export default [
  ...houseStyle({
    root: import.meta.dirname,
    web: "web/src",
    server: "server/src",
    // The docs capture helper runs by hand, so it may print and read the environment.
    scripts: ["scripts", "docs/images"],
    // Allowed to print: the CLI talks to the person running it, the server entry logs before its logger
    // exists, and the seed command reports to its operator.
    console: ["cli/src/index.ts", "server/src/index.ts", "server/src/seed.ts"],
    // The two helpers the route tests define assert inside: they count as assertions.
    assertFunctionNames: ["expect", "expectTypeOf", "expectError", "expectUnauthorized"],
    // data/ is the local database.
    ignores: ["data/**"],
  }),
  {
    // A warning for now (2026-11-11): these files still read the environment themselves. When the
    // server takes its settings from config.ts, this block goes and the rule is an error again.
    name: "satchel/process-env-warns",
    files: ["server/src/app.ts", "server/src/index.ts", "server/src/seed.ts", "cli/src/index.ts"],
    rules: { "n/no-process-env": "warn" },
  },
];

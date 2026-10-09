#!/usr/bin/env node
import { homedir } from "node:os";
import { main } from "./main.js";

/** The `satchel` binary. Runs from `dist/` with plain `node`; `src/` and `dist/` sit one level under the package root. */
process.exitCode = await main(
  process.argv.slice(2),
  {
    env: process.env,
    home: homedir(),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  },
  new URL("../", import.meta.url),
);

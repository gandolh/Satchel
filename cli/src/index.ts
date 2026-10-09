#!/usr/bin/env node
import { readFileSync } from "node:fs";

/** `src/` and `dist/` sit one level under the package, so `../package.json` is right from either. */
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

if (process.argv.slice(2).includes("--version")) console.log(pkg.version);

#!/usr/bin/env node
import { homedir } from "node:os";
import { main } from "./main.js";

/** Piped input, for `satchel reply <n>` with the text on stdin. Nothing when stdin is a terminal. */
async function readStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  return Buffer.concat(chunks).toString("utf8");
}

/** The `satchel` binary. Runs from `dist/` with plain `node`; `src/` and `dist/` sit one level under the package root. */
process.exitCode = await main(
  process.argv.slice(2),
  {
    env: process.env,
    home: homedir(),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    stdin: readStdin,
  },
  new URL("../", import.meta.url),
);

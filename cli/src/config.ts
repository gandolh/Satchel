import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { UsageError } from "./errors.js";

export const DEFAULT_URL = "https://gandolh.ro/satchel-api";

export interface Context {
  env: NodeJS.ProcessEnv;
  /** The user's home directory, for `~/.config/satchel/env`. */
  home: string;
  out: (line: string) => void;
  err: (line: string) => void;
}

/** Parse `KEY=value` lines: `#` comments, an optional `export`, optional quotes. */
export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    values[match[1]!] = match[2]!.replace(/^(['"])(.*)\1$/, "$2").trim();
  }
  return values;
}

function userFile(ctx: Context): Record<string, string> {
  const file = join(ctx.home, ".config", "satchel", "env");
  return existsSync(file) ? parseEnvFile(readFileSync(file, "utf8")) : {};
}

export const NO_TOKEN =
  "No Claude token. Create one in Satchel under Settings → Connect Claude and put it in ~/.config/satchel/env as SATCHEL_TOKEN=…";

/** Address and token, first match wins: the environment, `~/.config/satchel/env`, then (URL only) the default. Never a repo `.env`. */
export function resolveConfig(ctx: Context): { url: string; token: string } {
  const file = userFile(ctx);
  const pick = (key: string) => ctx.env[key]?.trim() || file[key]?.trim() || undefined;
  const url = (pick("SATCHEL_URL") ?? DEFAULT_URL).replace(/\/+$/, "");
  const token = pick("SATCHEL_TOKEN");
  if (!token) throw new UsageError(NO_TOKEN);
  return { url, token };
}

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
    const raw = match[2]!;
    const quoted = /^(['"])(.*)\1(?:\s+#.*)?$/.exec(raw);
    values[match[1]!] = quoted ? quoted[2]!.trim() : raw.replace(/\s+#.*$/, "").trim();
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
  assertSafeUrl(url);
  return { url, token };
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

/** The token goes out in a header, so only https (or a loopback host) may carry it. */
function assertSafeUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UsageError(`SATCHEL_URL isn't a valid URL: ${url}`);
  }
  if (parsed.protocol === "https:" || (parsed.protocol === "http:" && LOOPBACK.has(parsed.hostname))) return;
  throw new UsageError(`SATCHEL_URL must be https: the token is only sent over https (http is allowed for localhost only). Got ${url}`);
}

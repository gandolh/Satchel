import { createECDH } from "node:crypto";
import { z } from "zod";

/** The server's Web Push identity (brief 14), from `npx web-push generate-vapid-keys`. */
export interface VapidKeys {
  /** base64url, a 65-byte P-256 point. Browsers subscribe with it. */
  publicKey: string;
  /** base64url, 32 bytes. Signs every push; never leaves the server. */
  privateKey: string;
  /** `mailto:` or `https:`: who push services contact about this sender. */
  subject: string;
}

/** Push is on only when all three VAPID settings are present. */
export type PushSettings = { enabled: true; vapid: VapidKeys } | { enabled: false; missing: string[] };

/** The server's settings, read once at startup from the environment (and the repo's `.env`). */
export interface Config {
  host: string;
  port: number;
  /** As given. `index.ts` resolves a relative path against the repo root. */
  dataDir: string;
  /**
   * The app's own origin as the browser sees it, bare: the session cookie's
   * `Secure` rule, the `Origin` every write and WebSocket upgrade must carry.
   * `PUBLIC_ORIGIN`, or the origin of `WARD_OIDC_REDIRECT_URI` when that is set.
   */
  publicOrigin: string;
  /** The API prefix as the browser sees it: the session cookie's `Path` and where the Ward callback lives. Default `/satchel-api`. */
  apiPrefix: string;
  /** The web app's base path, with a trailing slash: where Ward sends the browser back to. Default `/satchel/` (the web build's `SATCHEL_BASE`). */
  webBase: string;
  /** Off, naming what is missing, unless VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are all set. */
  push: PushSettings;
}

/** The environment cannot run the server. The message names every key at fault. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export const VAPID_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;

/** base64url without padding that decodes to exactly `bytes` bytes. Messages never echo the value. */
const base64urlOf = (bytes: number) => (value: string) =>
  /^[A-Za-z0-9_-]+$/.test(value) && Buffer.from(value, "base64url").length === bytes;

/**
 * Who push services contact about this sender: a `mailto:` URL with an address
 * (`local@domain`) or an `https:` URL with a host name. A bare `mailto:` parses
 * as a URL but names nobody.
 */
function isVapidSubject(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  if (url.protocol === "mailto:") return /^[^@\s]+@[^@\s]+$/.test(url.pathname);
  return url.protocol === "https:" && url.hostname !== "";
}

/** An empty value (`KEY=` copied from `.env.example`) counts as not set. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const envSchema = z.object({
  HOST: optional(z.string()).transform((value) => value ?? "127.0.0.1"),
  PORT: optional(
    z.coerce.number<string>().int().min(1).max(65535, { message: "PORT must be a port number (1-65535)." }),
  ).transform((value) => value ?? 8807),
  DATA_DIR: optional(z.string()).transform((value) => value ?? "./data"),
  PUBLIC_ORIGIN: optional(
    z.string().refine((value) => URL.canParse(value) && new URL(value).origin === value, {
      message: "PUBLIC_ORIGIN must be a bare origin such as https://example.com: no path and no trailing slash.",
    }),
  ),
  SATCHEL_API_PREFIX: optional(
    z.string().regex(/^\/[^\s?#]*[^/\s?#]$/, {
      message: "SATCHEL_API_PREFIX must be a path such as /satchel-api: a leading slash and no trailing slash.",
    }),
  ).transform((value) => value ?? "/satchel-api"),
  SATCHEL_BASE: optional(
    z.string().regex(/^\/([^\s?#]*\/)?$/, {
      message: "SATCHEL_BASE must be a path such as /satchel/: a leading and a trailing slash.",
    }),
  ).transform((value) => value ?? "/satchel/"),
  VAPID_PUBLIC_KEY: optional(
    z.string().refine(base64urlOf(65), {
      message: "VAPID_PUBLIC_KEY must be the publicKey from `npx web-push generate-vapid-keys` (87 base64url characters).",
    }),
  ),
  VAPID_PRIVATE_KEY: optional(
    z.string().refine(base64urlOf(32), {
      message: "VAPID_PRIVATE_KEY must be the privateKey from `npx web-push generate-vapid-keys` (43 base64url characters).",
    }),
  ),
  VAPID_SUBJECT: optional(
    z.string().refine(isVapidSubject, {
      message:
        "VAPID_SUBJECT must be a mailto: URL with an address, such as mailto:johndoe@example.com, or an https: URL with a host name.",
    }),
  ),
});

/** Whether the private key's public half is `publicKey`. A mismatched pair fails every push. */
function isVapidPair(publicKey: string, privateKey: string): boolean {
  const ecdh = createECDH("prime256v1");
  try {
    ecdh.setPrivateKey(Buffer.from(privateKey, "base64url"));
  } catch {
    return false;
  }
  return ecdh.getPublicKey().equals(Buffer.from(publicKey, "base64url"));
}

function describe(issue: z.core.$ZodIssue): string {
  const key = String(issue.path[0] ?? "");
  return issue.message.startsWith(key) ? issue.message : `${key}: ${issue.message}`;
}

/** Parse and validate the environment. Throws `ConfigError` listing every problem; never exits. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map(describe).join("\n"));
  }
  const values = parsed.data;
  // Locally the Ward seed writes the redirect URI, and its origin is the dev server's.
  const redirectUri = env.WARD_OIDC_REDIRECT_URI;
  const publicOrigin =
    values.PUBLIC_ORIGIN ??
    (redirectUri !== undefined && URL.canParse(redirectUri) ? new URL(redirectUri).origin : undefined);
  if (publicOrigin === undefined) {
    throw new ConfigError(
      "PUBLIC_ORIGIN is not set. It is the app's own origin as the browser sees it, such as https://example.com (http://localhost:5175 in development).",
    );
  }
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = values;
  let push: PushSettings;
  if (publicKey !== undefined && privateKey !== undefined && subject !== undefined) {
    if (!isVapidPair(publicKey, privateKey)) {
      throw new ConfigError(
        "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not one pair. Copy both from the same `npx web-push generate-vapid-keys` run.",
      );
    }
    push = { enabled: true, vapid: { publicKey, privateKey, subject } };
  } else {
    push = { enabled: false, missing: VAPID_KEYS.filter((key) => values[key] === undefined) };
  }
  return {
    host: values.HOST,
    port: values.PORT,
    dataDir: values.DATA_DIR,
    publicOrigin,
    apiPrefix: values.SATCHEL_API_PREFIX,
    webBase: values.SATCHEL_BASE,
    push,
  };
}

/** The one line the server logs at startup when push is off. */
export function pushOffMessage(missing: readonly string[]): string {
  const some = missing.length < VAPID_KEYS.length;
  return (
    `Push notifications are off: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set` +
    `${some ? " (all three VAPID settings are needed)" : ""}. See "Push notifications" in the README.`
  );
}

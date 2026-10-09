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
  ward: {
    /** Bare origin, no trailing slash. Also the `iss` every Ward token must carry. */
    publicOrigin: string;
    /** `/ward-api` in every real deployment. Required: see Ward's integrating.md, rule 2. */
    apiBasePath: string;
    /** Server-side secret, sent as `x-ward-app-key` on every introspection. */
    appKey: string;
  };
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

const WARD_KEYS = ["WARD_PUBLIC_ORIGIN", "WARD_API_BASE_PATH", "WARD_APP_KEY"] as const;
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

const required = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

const envSchema = z.object({
  HOST: optional(z.string()).transform((value) => value ?? "127.0.0.1"),
  PORT: optional(
    z.coerce.number<string>().int().min(1).max(65535, { message: "PORT must be a port number (1-65535)." }),
  ).transform((value) => value ?? 8807),
  DATA_DIR: optional(z.string()).transform((value) => value ?? "./data"),
  WARD_PUBLIC_ORIGIN: required(
    z.string().refine((value) => URL.canParse(value) && new URL(value).origin === value, {
      message:
        "WARD_PUBLIC_ORIGIN must be a bare origin such as https://gandolh.ro: no path and no trailing slash. It is the issuer Ward signs tokens with.",
    }),
  ),
  WARD_API_BASE_PATH: required(
    z.string().regex(/^\/[^\s?#]*[^/\s?#]$/, {
      message: "WARD_API_BASE_PATH must be a path such as /ward-api: a leading slash and no trailing slash.",
    }),
  ),
  WARD_APP_KEY: required(z.string().min(1)),
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
  const isWardKey = (WARD_KEYS as readonly string[]).includes(key);
  if (isWardKey && issue.code === "invalid_type") {
    return (
      `${key} is not set. Locally, Ward's seed (../wzd_auth/infrastructure/local/seed.mjs) writes it ` +
      `into this repo's .env; in production vps-deploy provides it.`
    );
  }
  return issue.message.startsWith(key) ? issue.message : `${key}: ${issue.message}`;
}

/** Parse and validate the environment. Throws `ConfigError` listing every problem; never exits. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map(describe).join("\n"));
  }
  const values = parsed.data;
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
    ward: {
      publicOrigin: values.WARD_PUBLIC_ORIGIN,
      apiBasePath: values.WARD_API_BASE_PATH,
      appKey: values.WARD_APP_KEY,
    },
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

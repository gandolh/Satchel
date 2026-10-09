import { z } from "zod";

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
}

/** The environment cannot run the server. The message names every key at fault. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const WARD_KEYS = ["WARD_PUBLIC_ORIGIN", "WARD_API_BASE_PATH", "WARD_APP_KEY"] as const;

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
});

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
  return {
    host: values.HOST,
    port: values.PORT,
    dataDir: values.DATA_DIR,
    ward: {
      publicOrigin: values.WARD_PUBLIC_ORIGIN,
      apiBasePath: values.WARD_API_BASE_PATH,
      appKey: values.WARD_APP_KEY,
    },
  };
}

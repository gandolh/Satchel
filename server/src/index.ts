import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAccounts,
  createSqliteStore,
  createWardClient,
  wardClientOptionsFromEnv,
  type WardClient,
} from "../vendor/ward/ward-auth.js";
import { buildApp } from "./app.js";
import { linkExistingAccounts } from "./auth/migrate.js";
import { systemClock } from "./clock.js";
import { ConfigError, loadConfig, pushOffMessage, type Config } from "./config.js";
import { databasePath, openDb } from "./db/open.js";
import { createStore } from "./store.js";

/** `src/` (tsx in dev) and `dist/` (built) sit at the same depth, so this resolves the same from both. */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

try {
  process.loadEnvFile(`${REPO_ROOT}.env`);
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}

let config: Config;
try {
  config = loadConfig(process.env);
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  console.error(`Satchel cannot start:\n${err.message}`);
  process.exit(1);
}

// `npm run dev` runs the server from `server/`, so a relative DATA_DIR means the repo root's.
const dataDir = isAbsolute(config.dataDir) ? config.dataDir : resolve(REPO_ROOT, config.dataDir);
const db = openDb(databasePath(dataDir));
const store = createStore(db, systemClock);

// The library's tables (`auth_users`, `auth_sessions`, ...) live in the same database.
const accounts = createAccounts({ store: createSqliteStore(db) });

// Accounts written by the Ward-only version become local users linked to the same subject. Idempotent.
const linked = await linkExistingAccounts(db, accounts);
if (linked.created.length > 0 || linked.failed.length > 0) {
  const note = `${linked.created.length} existing account(s) became local users linked to their Ward subject`;
  console.log(
    `${note}${linked.placeholders.length > 0 ? `; ${linked.placeholders.length} named user-<subject> because their name could not be kept` : ""}.`,
  );
  for (const { subject, reason } of linked.failed) console.error(`Account ${subject} was not migrated: ${reason}.`);
}

// No WARD_OIDC_ISSUER: local accounts only. Does not contact Ward: it starts while Ward is down.
let ward: WardClient | undefined;
try {
  const wardOptions = wardClientOptionsFromEnv();
  ward = wardOptions === undefined ? undefined : await createWardClient(wardOptions);
} catch (err) {
  console.error(`Satchel cannot start: ${err instanceof Error ? err.message : String(err)}`);
  db.close();
  process.exit(1);
}

const app = await buildApp({
  store,
  accounts,
  ...(ward ? { ward } : {}),
  publicOrigin: config.publicOrigin,
  apiPrefix: config.apiPrefix,
  webBase: config.webBase,
  clock: systemClock,
  ...(config.push.enabled ? { push: { vapid: config.push.vapid } } : {}),
});
if (ward === undefined) app.log.info("WARD_OIDC_ISSUER is not set: local accounts only, no Sign in with Ward.");
// Once, at startup. A warning when one key of the pair is there without the
// other (or without a subject): that looks like a mistake. VAPID_SUBJECT alone
// is the normal "no keys yet" deploy, since vps-deploy fills it by default.
if (!config.push.enabled) {
  const { missing } = config.push;
  const someKey = !(missing.includes("VAPID_PUBLIC_KEY") && missing.includes("VAPID_PRIVATE_KEY"));
  app.log[someKey ? "warn" : "info"](pushOffMessage(missing));
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.close().then(
      () => {
        db.close();
        process.exit(0);
      },
      (err: unknown) => {
        app.log.error({ err }, `shutdown on ${signal} failed`);
        db.close();
        process.exit(1);
      },
    );
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error({ err }, `Satchel cannot listen on ${config.host}:${config.port}`);
  db.close();
  process.exit(1);
}

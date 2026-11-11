import closeWithGrace from "close-with-grace";
import { createAccounts, createSqliteStore, createWardClient, type WardClient } from "../vendor/ward/ward-auth.js";
import { buildApp } from "./app.js";
import { linkExistingAccounts } from "./plugins/auth/migrate.js";
import { systemClock } from "./lib/clock.js";
import {
  ConfigError,
  loadConfig,
  loadEnvFile,
  loadWardOptions,
  pushOffMessage,
  resolveDataDir,
  type Config,
} from "./config.js";
import { databasePath, openDb } from "./db/open.js";
import { createStore } from "./db/store.js";

/**
 * Starts Satchel: the API under `/api`, Claude's routes under `/claude`, sign-in
 * under `/auth`, on 127.0.0.1:8807 by default. Locally the owner runs it with
 * `npm start` or `npm run dev`; on the VPS it is the `satchel-api` container.
 * Nothing else in the server listens.
 *
 * Settings come from the environment, and from the repo root's `.env` for what
 * the environment leaves unset. `config.ts` lists them and stops the start with
 * a message naming any that is wrong.
 */

const envFile = loadEnvFile();

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  console.error(`Satchel cannot start:\n${err.message}`);
  process.exit(1);
}

const db = openDb(databasePath(resolveDataDir(config.dataDir)));
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
  const wardOptions = loadWardOptions();
  ward = wardOptions === undefined ? undefined : await createWardClient(wardOptions);
} catch (err) {
  console.error(`Satchel cannot start: ${err instanceof Error ? err.message : String(err)}`);
  db.close();
  process.exit(1);
}

const app = await buildApp({
  store,
  accounts,
  db,
  ...(ward ? { ward } : {}),
  publicOrigin: config.publicOrigin,
  apiPrefix: config.apiPrefix,
  webBase: config.webBase,
  trustedProxies: config.trustedProxies,
  clock: systemClock,
  ...(config.push.enabled ? { push: { vapid: config.push.vapid } } : {}),
  server: {
    // Loopback, plus the proxies the sign-in lockout already trusts. Satchel reads no `request.ip`
    // itself, so this changes only the address in the request log.
    trustProxy: ["loopback", ...config.trustedProxies],
    // A connection silent this long mid-request is cut. No route waits on anything slow, and an open
    // live socket belongs to `ws` once upgraded, outside this timer.
    connectionTimeout: 10_000,
    // The whole request, body included (64 KiB at most), must arrive within this. A push fan-out
    // starts after the reply, so it is not bounded by it.
    requestTimeout: 30_000,
    // Longer than Caddy keeps an idle upstream connection (2 minutes), so it never sends a request
    // down a connection the server has just closed.
    keepAliveTimeout: 125_000,
  },
});
app.log.info(envFile === undefined ? "no .env: settings from the environment" : `settings from ${envFile}`);
if (ward === undefined) app.log.info("WARD_OIDC_ISSUER is not set: local accounts only, no Sign in with Ward.");
// Once, at startup. A warning when one key of the pair is there without the
// other (or without a subject): that looks like a mistake. VAPID_SUBJECT alone
// is the normal "no keys yet" deploy, since vps-deploy fills it by default.
if (!config.push.enabled) {
  const { missing } = config.push;
  const someKey = !(missing.includes("VAPID_PUBLIC_KEY") && missing.includes("VAPID_PRIVATE_KEY"));
  app.log[someKey ? "warn" : "info"](pushOffMessage(missing));
}

// SIGINT, SIGTERM, an uncaught error: close every live socket (the websocket plugin's preClose),
// finish the requests in flight, wait for the pushes already started, close the database (the app's
// onClose hook), and exit. After 5 seconds it exits anyway, under the 10 seconds Docker gives a
// container to stop.
closeWithGrace({ delay: 5_000, logger: app.log }, async ({ signal, err }) => {
  if (err) app.log.error({ err }, "closing after an uncaught error");
  else app.log.info(`closing on ${signal ?? "exit"}`);
  await app.close();
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error({ err }, `Satchel cannot listen on ${config.host}:${config.port}`);
  db.close();
  process.exit(1);
}

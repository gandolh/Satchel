import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { systemClock } from "./clock.js";
import { ConfigError, loadConfig, type Config } from "./config.js";
import { databasePath, openDb } from "./db/open.js";
import { createStore } from "./store.js";
import { createWardClient } from "./ward/client.js";

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

const ward = createWardClient({
  publicOrigin: config.ward.publicOrigin,
  apiBasePath: config.ward.apiBasePath,
  appKey: config.ward.appKey,
});

const app = buildApp({ store, ward, clock: systemClock });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().finally(() => {
      db.close();
      process.exit(0);
    });
  });
}

await app.listen({ host: config.host, port: config.port });

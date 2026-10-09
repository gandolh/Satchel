import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp, type LogOptions } from "../../app.js";
import type { Clock } from "../../clock.js";
import { openDb, type Db } from "../../db/open.js";
import { createStore, type Store } from "../../store.js";
import { createWardClient, type WardClient } from "../client.js";
import { SATCHEL_APP_SLUG } from "../guard.js";
import { startFakeWard, type FakeWard } from "./fakeWard.js";

/**
 * A whole app for tests: an in-memory database, the real store, and the real
 * Ward client pointed at `fakeWard` (real HTTP, real EdDSA signatures). The
 * fake requires `TEST_APP_KEY`, as the real Ward requires a key, so every test
 * also proves the key is sent.
 *
 *     const t = await startTestApp();
 *     const cookie = await t.signIn({ subject: "subject-a", username: "ana" });
 *     const res = await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
 *     await t.close();
 */

export const TEST_APP_KEY = "wak_test_key";

export interface SignInOptions {
  subject: string;
  username: string;
  /** Default: `{ satchel: ["admin"] }`. Pass `{}` for an account with no Satchel grant. */
  grants?: Record<string, string[]>;
}

export interface TestApp {
  app: FastifyInstance;
  store: Store;
  db: Db;
  fakeWard: FakeWard;
  ward: WardClient;
  /** Lines the app logged, when started with `captureLogs: true`. */
  logs: string[];
  /** Start a live Ward session and return the `Cookie` header value: `ward_session=<jwt>`. */
  signIn(options: SignInOptions): Promise<string>;
  close(): Promise<void>;
}

export interface TestAppOptions {
  /** The app's clock (the store's timestamps). Default: the real time. */
  clock?: Clock;
  /** The key the app sends. Default `TEST_APP_KEY`, the one the fake requires. */
  appKey?: string;
  /** Turn the logger on at `info` and collect its lines in `logs`. */
  captureLogs?: boolean;
}

export function wardCookie(token: string): string {
  return `ward_session=${token}`;
}

export async function startTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const clock = options.clock ?? (() => new Date());
  const fakeWard = await startFakeWard();
  fakeWard.requireAppKey(TEST_APP_KEY);

  const ward = createWardClient({
    publicOrigin: fakeWard.origin,
    // The fake serves Ward's routes at its root.
    apiBasePath: "",
    appKey: options.appKey ?? TEST_APP_KEY,
  });

  const db = openDb(":memory:");
  const store = createStore(db, clock);
  const logs: string[] = [];
  const logger: LogOptions | false = options.captureLogs
    ? { level: "info", stream: { write: (line) => void logs.push(line) } }
    : false;
  const app = buildApp({ store, ward, clock, logger });

  return {
    app,
    store,
    db,
    fakeWard,
    ward,
    logs,
    async signIn({ subject, username, grants = { [SATCHEL_APP_SLUG]: ["admin"] } }) {
      const sessionId = `family_${randomUUID()}`;
      fakeWard.setSession(sessionId, { active: true, subject, username, grants });
      return wardCookie(await fakeWard.mintToken({ subject, sessionId }));
    },
    async close() {
      await app.close();
      db.close();
      await fakeWard.close().catch(() => undefined);
    },
  };
}

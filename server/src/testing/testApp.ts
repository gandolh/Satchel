import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  createAccounts,
  createSqliteStore,
  createWardClient,
  createWardIdentities,
  type Accounts,
  type WardClient,
  type WardIdentities,
} from "../../vendor/ward/ward-auth.js";
import { SESSION_COOKIE, buildApp, type LogOptions, type PushOptions } from "../app.js";
import type { Clock } from "../clock.js";
import { openDb, type Db } from "../db/open.js";
import { createStore, type Store } from "../store.js";
import { FAKE_ISSUER, createFakeWard, newClientKey, type FakeWard } from "./fakeWard.js";

/**
 * A whole app for tests: an in-memory database, the real store, the real
 * accounts store and the real `wardAuth` plugin. Ward is a fake `fetch`
 * behind a real `createWardClient` (`fakeWard.ts`).
 *
 *     const t = await startTestApp();
 *     const cookie = await t.signIn({ subject: "subject-a", username: "ana" });
 *     const res = await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
 *     await t.close();
 *
 * `signIn` starts a **local** session for a user whose id is `subject`, the
 * same key the rows use. `signInWithWard` starts one that began with Ward.
 */

/** The app's own origin, as every browser request in the tests carries it. Loopback, so the cookie is not `Secure`. */
export const TEST_ORIGIN = "http://127.0.0.1:5175";
export const TEST_API_PREFIX = "/satchel-api";
export const TEST_WEB_BASE = "/satchel/";
/** The password every user made by `signIn` can log in with. Not a secret: it exists only in memory. */
export const TEST_PASSWORD = "correct horse battery";

export interface SignInOptions {
  subject: string;
  username: string;
  /** Default `admin`, the owner. Pass `member` for a friend. */
  role?: string;
}

export interface TestApp {
  app: FastifyInstance;
  /** The app's own origin: send it as `Origin` for a same-origin browser request. */
  origin: string;
  store: Store;
  db: Db;
  accounts: Accounts;
  identities: WardIdentities;
  /** The fake Ward behind `ward`. */
  fakeWard: FakeWard;
  /** The Ward client the app was given; absent when started with `ward: false`. */
  ward: WardClient | undefined;
  /** Moves the Ward client's clock (its 30-second cache), in ms. */
  advanceWard(ms: number): void;
  /** Lines the app logged, when started with `captureLogs: true`. */
  logs: string[];
  /** Create the user if needed and start a local session. Returns the `Cookie` header value. */
  signIn(options: SignInOptions): Promise<string>;
  /**
   * Create the user (linked to `wardSubject`) if needed and start a session
   * that began with Ward, whose Ward session is live. Returns the cookie and
   * the Ward session id, to end it with `fakeWard.setSession(wardSid, false)`.
   */
  signInWithWard(options: SignInOptions & { wardSubject?: string }): Promise<{ cookie: string; wardSid: string }>;
  close(): Promise<void>;
}

export interface TestAppOptions {
  /** The store's timestamps. Default: the real time. */
  clock?: Clock;
  /** Turn the logger on at `info` and collect its lines in `logs`. */
  captureLogs?: boolean;
  /** Default true. False runs the app with local accounts only. */
  ward?: boolean;
  /** How often an open live socket asks the guard again, in ms. Default: the app's (10 seconds). */
  liveRecheckMs?: number;
  /** Web Push, as `buildApp` takes it. Default: off. */
  push?: PushOptions;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}`;
}

export async function startTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const clock = options.clock ?? (() => new Date());
  const db = openDb(":memory:");
  const store = createStore(db, clock);
  const accounts = createAccounts({ store: createSqliteStore(db) });
  const identities = createWardIdentities({ accounts });

  const fakeWard = createFakeWard();
  let wardNow = Date.now();
  const ward =
    options.ward === false
      ? undefined
      : await createWardClient({
          issuer: FAKE_ISSUER,
          clientId: "satchel",
          clientKey: newClientKey(),
          redirectUri: `${TEST_ORIGIN}${TEST_API_PREFIX}/auth/ward/callback`,
          postLogoutRedirectUri: `${TEST_ORIGIN}${TEST_WEB_BASE}`,
          fetch: fakeWard.fetch,
          now: () => wardNow,
        });

  const logs: string[] = [];
  const logger: LogOptions | false = options.captureLogs
    ? { level: "info", stream: { write: (line) => void logs.push(line) } }
    : false;
  const app = await buildApp({
    store,
    accounts,
    ...(ward ? { ward } : {}),
    publicOrigin: TEST_ORIGIN,
    apiPrefix: TEST_API_PREFIX,
    webBase: TEST_WEB_BASE,
    clock,
    logger,
    ...(options.push ? { push: options.push } : {}),
    ...(options.liveRecheckMs ? { liveRecheckMs: options.liveRecheckMs } : {}),
  });

  async function userFor({ subject, username, role = "admin" }: SignInOptions) {
    const existing = await accounts.findUserById(subject);
    if (existing === undefined) return accounts.createUser({ id: subject, username, password: TEST_PASSWORD, role });
    if (existing.role !== role) await accounts.setRole(subject, role);
    return existing;
  }

  return {
    app,
    origin: TEST_ORIGIN,
    store,
    db,
    accounts,
    identities,
    fakeWard,
    ward,
    advanceWard(ms) {
      wardNow += ms;
    },
    logs,
    async signIn(who) {
      const user = await userFor(who);
      return sessionCookie((await accounts.startSession(user.id)).token);
    },
    async signInWithWard({ wardSubject, ...who }) {
      const user = await userFor(who);
      const subject = wardSubject ?? `ward-${user.id}`;
      if ((await identities.subjectOf(user.id)) === undefined) await identities.link(user.id, subject);
      const wardSid = `family_${randomUUID()}`;
      fakeWard.setSession(wardSid, true);
      const { token } = await accounts.startSession(user.id, { origin: "ward", wardSid });
      return { cookie: sessionCookie(token), wardSid };
    },
    async close() {
      await app.close();
      db.close();
    },
  };
}

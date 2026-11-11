import { routes } from "@satchel/shared";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { wardAuth, type Accounts, type WardClient } from "../../../vendor/ward/ward-auth.js";
import type { Store } from "../../db/store.js";
import { registerAccountGuard } from "./guard.js";
import { registerUpgradeChecks } from "./origin.js";

export interface AuthOptions {
  store: Store;
  /** The local accounts, on the same SQLite handle as `store`. */
  accounts: Accounts;
  /** "Sign in with Ward". Absent means local accounts only. */
  ward?: WardClient;
  /** The app's own origin as the browser sees it. Writes and WebSocket upgrades from any other are refused. */
  publicOrigin: string;
  /** The API prefix as the browser sees it: the session cookie's `Path`. */
  apiPrefix: string;
  /** The web app's base path with a trailing slash: where Ward sends the browser back to. */
  webBase: string;
  /** The proxies whose `X-Forwarded-For` the login lockout believes, besides loopback. */
  trustedProxies: readonly string[];
  /** The session cookie's name. */
  cookieName: string;
  /** Where the plugin's routes sit as Fastify sees them (`/auth`). */
  routePrefix: string;
}

/**
 * Sign-in and the guard, as root hooks, in this order:
 *
 * 1. a WebSocket upgrade must carry the app's own `Origin` (`origin.ts`);
 * 2. the vendored `wardAuth` plugin refuses every route without a live session
 *    except `GET /api/health` and `/claude/*`, judged by route pattern, and
 *    serves `/auth/*` (local login, "Sign in with Ward", the 30-second Ward
 *    check);
 * 3. `guard.ts` refuses cross-origin writes and turns the session's user into
 *    `request.account` on `/api/*`.
 *
 * `/claude/*` takes a Claude token instead and never has a session.
 */
const auth: FastifyPluginAsync<AuthOptions> = async (app, options) => {
  const { store, accounts, ward, publicOrigin, apiPrefix, webBase, trustedProxies, cookieName, routePrefix } = options;
  registerUpgradeChecks(app, publicOrigin);
  await app.register(wardAuth, {
    accounts,
    cookieName,
    cookiePath: apiPrefix,
    publicOrigin,
    routePrefix,
    // Given, even when empty, so the plugin doesn't read AUTH_TRUSTED_PROXIES itself: config.ts did.
    trustedProxies,
    // `/claude/*` takes a Claude token and has no session. `isPublic` sees the matched route pattern.
    publicRoutes: [`GET ${routes.health.path}`],
    isPublic: (request) => (request.routeOptions.url ?? "").startsWith("/claude/"),
    ...(ward && {
      ward: {
        client: ward,
        loginPath: webBase,
        settingsPath: `${webBase}settings`,
        afterSignInPath: webBase,
      },
    }),
  });
  // After wardAuth has loaded: a hook added earlier would run first and see `request.auth` unset.
  registerAccountGuard(app, { store, publicOrigin });
};

/**
 * Wrapped in fastify-plugin, so its hooks are the root's: registered before
 * the features, they run for every route, and Fastify copies them into each
 * feature's context when it is created.
 */
export const authPlugin = fp(auth, { name: "satchel-auth" });

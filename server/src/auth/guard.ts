import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError, sendError } from "../errors.js";
import type { Store } from "../store.js";

/**
 * Satchel's half of the guard. The vendored `wardAuth` plugin (`app.ts`) is
 * the other half: it refuses every request without a live session, and checks
 * a Ward-originated session against Ward at most every 30 seconds. By the time
 * this hook runs, `request.auth` is the signed-in local user, or `null` on a
 * route the plugin let through without one.
 *
 * What is left for Satchel, on every `/api/*` route that has a session:
 *
 * - A write a browser sent from another origin is a **403 `forbidden`**
 *   (`crossOriginWrite`). The plugin applies that rule to its own routes only.
 * - The user's `accounts` row exists (every table keys on it), its display name
 *   is the username, and the account is active.
 * - The user's **role** comes from the plugin's `auth_users` row: `admin` marks
 *   the owner, the only account with an Ideas inbox and Claude tokens
 *   (decisions.md, "The Ideas inbox is owner-only"). Friends hold `member`. The
 *   owner's inbox is made here when missing; nobody else gets one. An account
 *   that is not an admin has its Claude tokens revoked.
 *
 * `/claude/*` and `GET /api/health` are not behind the plugin: they take a
 * Claude token or nothing, and `request.account` is `null` there.
 *
 * Satchel no longer learns that a Ward grant was removed, and no longer locks
 * the account out when that happens (`store.lockOutAccount` is unused now, and
 * kept): a local user keeps working by design, and only the Ward-originated
 * session ends, within 30 seconds, through the plugin. See decisions.md.
 */

/** The Satchel role that marks the owner. Friends hold `member`, never this. */
export const OWNER_ROLE = "admin";

/** The signed-in caller, set by the guard on every `/api/*` request it lets through. */
export interface SignedInAccount {
  /**
   * The local user's id: stable and never recycled. Key rows on this. For an
   * account that existed before local sign-in it is the old Ward subject.
   */
  subject: string;
  /** The local username, as of this request. Stored as the account's display name. */
  username: string;
  /** The account's roles on Satchel; never empty. A set: test with `isOwner`. */
  roles: readonly string[];
  /** The owner's Ideas inbox, made by the guard if it was missing. Null for a friend, who has none. */
  inboxId: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set on `/api/*` routes that have a session; `null` everywhere else. */
    account: SignedInAccount | null;
  }
}

/**
 * The caller on a guarded route. Throws (a 500) when called outside the guard,
 * which is a bug in the route, never a client error.
 */
export function signedIn(request: FastifyRequest): SignedInAccount {
  if (request.account === null) {
    throw new Error("signedIn() was called on a route the session guard does not cover");
  }
  return request.account;
}

/** Whether the account holds the owner's role on Satchel. */
export function isOwner(account: SignedInAccount): boolean {
  return account.roles.includes(OWNER_ROLE);
}

/**
 * The caller on a route only the owner may use. A friend is a **403
 * `forbidden`** with `message`; nothing else about the request is looked at.
 */
export function requireOwner(request: FastifyRequest, message: string): SignedInAccount {
  const account = signedIn(request);
  if (!isOwner(account)) throw new ApiError("forbidden", message);
  return account;
}

/** Whether the matched route is one of the API's session routes (`/api/*`). Judged by pattern, never by the raw URL. */
export function isApiRoute(request: FastifyRequest): boolean {
  return (request.routeOptions.url ?? "").startsWith("/api/");
}

/** Methods that change nothing, so a cross-origin one is harmless. */
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Whether this is a write a browser sent from a page on another origin.
 *
 * Only for an unsafe method (not GET, HEAD or OPTIONS):
 *
 * - an `Origin` header that is not exactly `publicOrigin` (the string `null`
 *   included), or
 * - no `Origin`, and a `Sec-Fetch-Site` header that is not `same-origin`.
 *
 * A request with neither header was not sent by a current browser (the CLI, a
 * script, the tests), so no page can have made it ride on the owner's cookie,
 * and it passes. The session cookie is `SameSite=Lax`, which lets a same-site
 * page on a subdomain post a body-less form with it attached; this is what
 * stops that.
 */
export function crossOriginWrite(request: FastifyRequest, publicOrigin: string): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const origin = request.headers.origin;
  if (origin !== undefined) return origin !== publicOrigin;
  const fetchSite = request.headers["sec-fetch-site"];
  return fetchSite !== undefined && fetchSite !== "same-origin";
}

export interface AccountGuardDeps {
  store: Store;
  /** The app's own origin as the browser sees it. Writes from any other are refused. */
  publicOrigin: string;
}

/**
 * Register after `wardAuth` has loaded (`await app.register(wardAuth, ...)`):
 * a hook added earlier would run first and see `request.auth` unset.
 */
export function registerAccountGuard(app: FastifyInstance, { store, publicOrigin }: AccountGuardDeps): void {
  app.decorateRequest("account", null);

  app.addHook("onRequest", async (request, reply) => {
    if (!isApiRoute(request) || request.auth === null || request.auth === undefined) return;

    // Before any handler runs.
    if (crossOriginWrite(request, publicOrigin)) {
      request.log.warn({ method: request.method, url: request.url }, "cross-origin write refused");
      return sendError(reply, "forbidden", "Satchel only accepts changes from its own pages.");
    }

    const { id, username, role } = request.auth.user;
    // Account first: the inbox's rows reference it. This also makes an account
    // that was locked out active again.
    store.upsertAccount(id, username);
    const owner = role === OWNER_ROLE;
    // Claude tokens are the owner's. An account that lost admin keeps its
    // inbox rows but not the tokens that read them.
    if (!owner) store.revokeAllClaudeTokens(id);
    const inboxId = owner ? store.ensureInbox(id) : null;
    request.account = { subject: id, username, roles: [role], inboxId };
  });
}

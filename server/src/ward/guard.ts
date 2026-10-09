import type { FastifyInstance, FastifyRequest } from "fastify";
import { sendError } from "../errors.js";
import type { Store } from "../store.js";
import type { WardClient } from "./client.js";
import { WardAuthenticationError, WardConfigurationError, WardUnavailableError } from "./errors.js";
import type { ActiveSession } from "./session.js";

/**
 * Satchel's Ward guard: the one file of the Ward module that is Satchel's own.
 * `claims`, `verify`, `introspect` and `client` are Ward's reference client,
 * copied unchanged (Ward's `corpus/wiki/integrating.md`).
 *
 * Every `/api/*` route except `/api/health` needs a live Ward session that
 * holds a Satchel grant. `/claude/*` never runs this: those routes take a
 * Claude token instead, and no cookie is read for them.
 *
 * Before any of that, an unsafe request (anything but GET, HEAD and OPTIONS)
 * that a browser sent from another origin is a **403 `forbidden`**, with no
 * call to Ward. The session cookie is `SameSite=Lax` on a shared origin, so a
 * same-site page (another app on a subdomain) could otherwise post a
 * body-less form to `/api/claude-tokens` with the owner's cookie attached. See
 * `crossOriginWrite`.
 *
 * Then three outcomes, three statuses, never collapsed:
 *
 * - **401 `unauthorized`**: no cookie, a token that does not verify (EdDSA
 *   only, `iss`, `aud`, expiry), or a session Ward says is not live. Signing
 *   in fixes it.
 * - **403 `forbidden`**: a live session with no `satchel` grant. Holding a
 *   Ward account confers nothing; signing in again changes nothing. Every
 *   live Claude token the subject made is revoked then. Satchel only learns
 *   of a lost grant here, so the tokens go at the subject's next request,
 *   not the moment the grant is removed in Ward.
 * - **503 `unavailable`**: Ward unreachable, a timeout, a 5xx, a body outside
 *   the contract, a key set Ward cannot serve, or Ward refusing this app's
 *   key. Fail closed: never "signed out", never a stale answer.
 */

/** Ward's `apps.slug` for Satchel: the key into an introspection's `grants`. */
export const SATCHEL_APP_SLUG = "satchel";

/** The signed-in caller, set by the guard on every request it lets through. */
export interface SignedInAccount {
  /** Ward's subject: stable, opaque, never recycled. Key rows on this. */
  subject: string;
  /** Ward's username, as of this request. Stored as the account's display name. */
  username: string;
  /** The account's Ideas inbox, made by the guard if it was missing. */
  inboxId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the Ward guard on `/api/*` (not `/api/health`); `null` everywhere else. */
    account: SignedInAccount | null;
  }
}

/**
 * The caller on a guarded route. Throws (a 500) when called outside the guard,
 * which is a bug in the route, never a client error.
 */
export function signedIn(request: FastifyRequest): SignedInAccount {
  if (request.account === null) {
    throw new Error("signedIn() was called on a route the Ward guard does not cover");
  }
  return request.account;
}

/**
 * Whether the guard runs for this request.
 *
 * A matched route is judged by its **pattern** (`request.routeOptions.url`),
 * never by the raw URL, so no encoding or query string can reach a guarded
 * handler without the guard. A request that matched nothing reaches no
 * handler either way; its raw path decides only whether it gets a 401 or the
 * 404.
 */
export function needsWardSession(request: FastifyRequest): boolean {
  const path = request.routeOptions.url ?? request.url.split("?", 1)[0] ?? "";
  return path.startsWith("/api/") && path !== "/api/health";
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
 * A request with neither header was not sent by a current browser (the CLI,
 * a script, the tests), so no page can have made it ride on the owner's
 * cookie, and it passes. Ward's own `/refresh` and `/logout` check lets
 * header-less requests through for the same reason. `publicOrigin` is the deploy's one shared origin
 * (`WARD_PUBLIC_ORIGIN`); in local dev the Vite proxy rewrites a same-origin
 * page's `Origin` to it, as Caddy's single origin makes it true in the deploy.
 */
export function crossOriginWrite(request: FastifyRequest, publicOrigin: string): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const origin = request.headers.origin;
  if (origin !== undefined) return origin !== publicOrigin;
  const fetchSite = request.headers["sec-fetch-site"];
  return fetchSite !== undefined && fetchSite !== "same-origin";
}

export interface WardGuardDeps {
  ward: WardClient;
  store: Store;
  /** The app's own origin as the browser sees it: `WARD_PUBLIC_ORIGIN`. Writes from any other are refused. */
  publicOrigin: string;
}

export function registerWardGuard(app: FastifyInstance, { ward, store, publicOrigin }: WardGuardDeps): void {
  app.decorateRequest("account", null);

  app.addHook("onRequest", async (request, reply) => {
    if (!needsWardSession(request)) return;

    // First, before Ward is asked anything and before any handler runs.
    if (crossOriginWrite(request, publicOrigin)) {
      request.log.warn({ method: request.method, url: request.url }, "cross-origin write refused");
      return sendError(reply, "forbidden", "Satchel only accepts changes from its own pages.");
    }

    let session: ActiveSession;
    try {
      session = await ward.authenticate(request.headers.cookie);
    } catch (error) {
      // `WardConfigurationError` extends `WardUnavailableError`, so it must be
      // tested first; both fail closed with a 503.
      if (error instanceof WardConfigurationError) {
        request.log.error(
          { err: error },
          "Ward rejected WARD_APP_KEY (introspection answered 401); failing closed. Re-run Ward's seed.mjs locally, or issue a new key in Ward's console.",
        );
        return sendError(reply, "unavailable", "Satchel cannot reach Ward, the sign-in service. Try again later.");
      }
      if (error instanceof WardUnavailableError) {
        request.log.error({ err: error }, "ward is not answering; failing closed");
        return sendError(reply, "unavailable", "Ward, the sign-in service, is not answering. Try again in a minute.");
      }
      if (error instanceof WardAuthenticationError) {
        return sendError(reply, "unauthorized", "Sign in with Ward to use Satchel.");
      }
      throw error;
    }

    // Any role at all opens Satchel. `grants` is the whole estate's; only ours counts.
    const roles = session.grants[SATCHEL_APP_SLUG];
    if (!Array.isArray(roles) || roles.length === 0) {
      // A grant taken away takes the subject's Claude tokens with it. Revoking
      // never creates an account row: a stranger has no tokens to revoke.
      const revokedTokens = store.revokeAllClaudeTokens(session.subject);
      request.log.warn({ subject: session.subject, revokedTokens }, "live ward session with no satchel grant");
      return sendError(reply, "forbidden", "This Ward account has no access to Satchel. Ask the owner for a grant.");
    }

    // Account first: the inbox's rows reference it.
    store.upsertAccount(session.subject, session.username);
    const inboxId = store.ensureInbox(session.subject);
    request.account = { subject: session.subject, username: session.username, inboxId };
  });
}

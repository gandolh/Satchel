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
 * Three outcomes, three statuses, never collapsed:
 *
 * - **401 `unauthorized`**: no cookie, a token that does not verify (EdDSA
 *   only, `iss`, `aud`, expiry), or a session Ward says is not live. Signing
 *   in fixes it.
 * - **403 `forbidden`**: a live session with no `satchel` grant. Holding a
 *   Ward account confers nothing; signing in again changes nothing.
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

export interface WardGuardDeps {
  ward: WardClient;
  store: Store;
}

export function registerWardGuard(app: FastifyInstance, { ward, store }: WardGuardDeps): void {
  app.decorateRequest("account", null);

  app.addHook("onRequest", async (request, reply) => {
    if (!needsWardSession(request)) return;

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
      request.log.warn({ subject: session.subject }, "live ward session with no satchel grant");
      return sendError(reply, "forbidden", "This Ward account has no access to Satchel. Ask the owner for a grant.");
    }

    // Account first: the inbox's rows reference it.
    store.upsertAccount(session.subject, session.username);
    const inboxId = store.ensureInbox(session.subject);
    request.account = { subject: session.subject, username: session.username, inboxId };
  });
}

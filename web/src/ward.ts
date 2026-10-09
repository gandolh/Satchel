import { appBase } from "./base";
import { Unavailable } from "./errors";

/**
 * Ward, from the browser. Satchel has no login screen: Ward serves the estate's
 * one login page at `/ward/login`, and the session is Ward's `ward_session`
 * cookie (`Path=/` on the shared origin), which this module never sees.
 *
 * - Sign in: navigate to `/ward/login?next=<path>`. `next` is a bare path under
 *   the app's base. Ward refuses absolute URLs, so a bare path is the only form
 *   that works, and anything outside `/satchel/` falls back to `/satchel/`.
 * - Renew: `POST /ward-api/refresh` answers 200 with fresh cookies, or 401
 *   `invalid_refresh` for every failure there is. One attempt, never a loop.
 * - Sign out: `POST /ward-api/refresh/logout` (always 204), then the login page.
 *
 * Ward's `/refresh` and `/logout` check `Origin`; the browser sends it on these
 * same-origin POSTs, and the Vite dev proxy rewrites it to Ward's own.
 */

export const WARD_LOGIN_PATH = "/ward/login";
export const WARD_REFRESH_PATH = "/ward-api/refresh";
export const WARD_LOGOUT_PATH = "/ward-api/refresh/logout";

/** The access token lives 15 minutes; renewing at 12 keeps it from lapsing mid-typing. */
export const RENEW_EVERY_MS = 12 * 60_000;
/** How often the renewal timer looks at the clock. */
const RENEW_CHECK_MS = 60_000;
/** After a renewal that couldn't reach Ward, try again this soon instead of in 12 minutes. */
const RENEW_RETRY_MS = 60_000;
/** Ward's own cap on `next`. */
const MAX_NEXT_LENGTH = 512;

/**
 * Where Ward should send the browser back to: the current path when it is
 * under the app's base, the base otherwise. The query and hash are dropped;
 * no Satchel route uses them.
 */
export function nextPathFor(location: Pick<Location, "pathname">, base: string = appBase()): string {
  const path = location.pathname;
  const fits =
    path.startsWith(base) &&
    !path.startsWith("//") &&
    path.length <= MAX_NEXT_LENGTH &&
    !/[\\\s]/.test(path);
  return fits ? path : base;
}

export function wardLoginUrl(next: string): string {
  return `${WARD_LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

/**
 * Send the browser to Ward's login page. `assign`, not `replace`, so Back
 * still returns to the page that bounced.
 */
export function goToWardLogin(next: string = nextPathFor(window.location)): void {
  window.location.assign(wardLoginUrl(next));
}

// --- Renewal ------------------------------------------------------------------

/** The one refresh in flight, shared by every caller: the 401 path, the timer, a StrictMode remount. */
let inFlight: Promise<boolean> | undefined;
/** Bumped on every successful refresh, so a 401 that raced one can just retry. */
let generation = 0;
let lastRenewedAt = Date.now();

async function postRefresh(): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(WARD_REFRESH_PATH, { method: "POST", credentials: "same-origin" });
  } catch {
    throw new Unavailable(0);
  }
  if (response.ok) {
    generation += 1;
    lastRenewedAt = Date.now();
    return true;
  }
  // A 5xx is Ward (or the proxy in front of it) not answering, not a verdict
  // on the session. The login page is Ward's too, so redirecting would loop.
  if (response.status >= 500) throw new Unavailable(response.status);
  return false;
}

/**
 * Renew the session once. `true`: renewed. `false`: the session is over.
 * Throws `Unavailable` when Ward can't be reached. Concurrent callers share
 * one request; the promise clears once it settles, so this de-duplicates and
 * never caches.
 */
export function refresh(): Promise<boolean> {
  inFlight ??= postRefresh().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

/** The renewal count, read before a request so `renewSince` can tell whether one happened since. */
export function renewalGeneration(): number {
  return generation;
}

/**
 * Renew after a 401 to a request sent at `since`. When a refresh already
 * succeeded after that request left, its 401 was the old cookie: retry
 * without spending another refresh.
 */
export function renewSince(since: number): Promise<boolean> {
  return since === generation ? refresh() : Promise.resolve(true);
}

/**
 * Renew every 12 minutes while the page is visible. A tab hidden for longer
 * renews the moment it is shown again. Returns a stop function.
 */
export function startRenewal(onSignedOut: () => void = () => goToWardLogin()): () => void {
  const check = () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastRenewedAt < RENEW_EVERY_MS) return;
    // Pushed forward now so a slow refresh isn't started twice by the next tick.
    lastRenewedAt = Date.now();
    refresh().then(
      (renewed) => {
        if (!renewed) onSignedOut();
      },
      () => {
        // Ward didn't answer. The next API call says so if it matters; try
        // again in a minute rather than in twelve.
        lastRenewedAt = Date.now() - RENEW_EVERY_MS + RENEW_RETRY_MS;
      },
    );
  };
  const timer = setInterval(check, RENEW_CHECK_MS);
  document.addEventListener("visibilitychange", check);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", check);
  };
}

/** End the Ward session (every app's, it is one session) and go to the login page. */
export async function signOut(): Promise<void> {
  try {
    await fetch(WARD_LOGOUT_PATH, { method: "POST", credentials: "same-origin" });
  } catch {
    // Leave anyway: the login page is where a signed-out browser belongs, and
    // it says so itself if the session somehow survived.
  }
  goToWardLogin(appBase());
}

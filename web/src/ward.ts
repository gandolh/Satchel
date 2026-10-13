import { configureAuth, getAuthClient } from "../vendor/ward/ward-auth-react.js";
import { API_BASE, appBase } from "./base";

/**
 * Accounts, from the browser. Satchel has its own login page and its own
 * session (an opaque `satchel_session` cookie scoped to the API prefix); the
 * vendored hooks (`vendor/ward/ward-auth-react.js`) do the talking and render
 * nothing. "Sign in with Ward" is a button on that page: the server finishes an
 * OpenID Connect round trip with Ward and the browser lands back here signed in.
 *
 * - `setUpAuth()` points the hooks at the plugin's routes. Once, before the
 *   first render (`main.tsx`).
 * - There is nothing to renew: the session slides on use, and the server ends
 *   a Ward-originated one within 30 seconds of Ward ending it.
 * - A request that comes back 401 means the session is over:
 *   `sessionEnded()` has the shared session state ask the server again, which
 *   flips the gate to the login page, with the reason when there is one.
 */

/** The plugin's routes as the browser sees them. */
export const AUTH_BASE_PATH = `${API_BASE}/auth`;

export function setUpAuth(): void {
  configureAuth({ basePath: AUTH_BASE_PATH });
}

/** Ask the server who is signed in, now. Never throws. */
export function sessionEnded(): void {
  try {
    void getAuthClient()
      .refresh()
      .catch(() => undefined);
  } catch {
    // Not configured (a test that never ran `setUpAuth`): nothing is listening.
  }
}

/** Ward may send the browser back to any path on this origin; the page after sign-in is the one it was on when it is under the app. */
const MAX_RETURN_LENGTH = 512;

/**
 * Where to land after "Sign in with Ward": the current path when it is under
 * the app's base, the base otherwise. The query and hash are dropped; no
 * Satchel route uses them.
 */
export function returnToFor(location: Pick<Location, "pathname">, base: string = appBase()): string {
  const path = location.pathname;
  const fits =
    path.startsWith(base) && !path.startsWith("//") && path.length <= MAX_RETURN_LENGTH && !/[\\\s]/.test(path);
  return fits ? path : base;
}

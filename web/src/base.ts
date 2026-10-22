/**
 * The app's root path, with one trailing slash: `/satchel/` unless the build set
 * `SATCHEL_BASE` (production sets `/`, the root of Satchel's own host). Read on every call rather than once at
 * module load, so tests can stub `import.meta.env.BASE_URL`.
 */
export function appBase(): string {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base : `${base}/`;
}

/** Where Caddy (and the Vite dev proxy) serve the API, as the browser sees it. The session cookie's path, and where Ward's callback lives. */
export const API_BASE = "/satchel-api";

/**
 * The app's root path on the shared origin, with one trailing slash: `/satchel/`
 * unless the build set `SATCHEL_BASE`. Read on every call rather than once at
 * module load, so tests can stub `import.meta.env.BASE_URL`.
 */
export function appBase(): string {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base : `${base}/`;
}

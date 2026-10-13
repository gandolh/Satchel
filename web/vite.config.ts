import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Local dev on one origin, the way Caddy serves the deploy: `/satchel-api` is
 * the API with the prefix stripped. The session cookie is scoped to that
 * prefix, and so are the auth routes and Ward's callback
 * (`/satchel-api/auth/ward/callback`), so one proxy rule carries all of it.
 * Ward itself is reached by the browser at its own origin (the issuer in
 * `WARD_OIDC_ISSUER`) and by the API's server directly, so it needs no rule.
 *
 * The browser's own `Origin` goes through untouched: the API's `PUBLIC_ORIGIN`
 * is this dev server's origin (`http://localhost:5175`), and it refuses a write
 * or a WebSocket upgrade from any other.
 */
function devProxy(env: Record<string, string>): Record<string, ProxyOptions> {
  return {
    "/satchel-api": {
      target: `http://127.0.0.1:${env.PORT || 8807}`,
      rewrite: (url) => url.replace(/^\/satchel-api/, ""),
      // Pass WebSocket upgrades through too (brief 12), prefix stripped the same way.
      ws: true,
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, REPO_ROOT, "");
  const rawBase = process.env.SATCHEL_BASE ?? env.SATCHEL_BASE ?? "/satchel/";
  // Scope, start URL and the navigation fallback all assume one trailing slash.
  const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        // Our own worker, src/sw.ts, so it can show pushes (brief 14). It
        // precaches the app shell exactly as the generated one did; workbox
        // only injects the file list. The navigation fallback and the
        // API/Ward denylist live in sw.ts now.
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        // A new worker waits; main.tsx applies it once the page is hidden.
        registerType: "prompt",
        // main.tsx registers through `virtual:pwa-register`.
        injectRegister: false,
        // The icons are in public/ and the png glob below precaches them once.
        includeManifestIcons: false,
        manifest: {
          id: base,
          name: "Satchel",
          short_name: "Satchel",
          description: "A small messenger, with an Ideas inbox Claude can read.",
          lang: "en",
          display: "standalone",
          scope: base,
          start_url: base,
          // Raw hex only here: the manifest can't read CSS tokens. Keep in
          // step with --accent and --bg (light) in src/styles/tokens.css.
          theme_color: "#2A45C4",
          background_color: "#F2F5F4",
          // Relative, so they resolve against the manifest under `base`.
          icons: [
            { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
            // The "S" sits inside the maskable safe zone, so the same image serves.
            { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        injectManifest: {
          // The app shell only: HTML, JS, CSS, icons, and the woff2 fonts (the
          // .woff fallbacks are built but never needed by a browser that runs
          // a service worker). Nothing is cached at runtime: not the API, not Ward.
          globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        },
      }),
    ],
    server: { port: 5175, strictPort: true, proxy: devProxy(env) },
    // `vite preview` serves the built app (with its service worker) behind the
    // same proxy, for checking installability locally.
    preview: { port: 4175, strictPort: true, proxy: devProxy(env) },
  };
});

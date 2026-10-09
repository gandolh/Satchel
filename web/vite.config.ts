import type { IncomingMessage } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Local dev on one origin, the way Caddy serves the deploy: `/satchel-api` is
 * the API with the prefix stripped, and `/ward` + `/ward-api` are the Ward the
 * API trusts (WARD_PUBLIC_ORIGIN; locally the container on 8792).
 *
 * Ward refuses /refresh and /logout unless the request's Origin is its own,
 * and the API refuses a write, or a WebSocket upgrade (`/api/live`), whose
 * Origin is not WARD_PUBLIC_ORIGIN. A request from a page on this dev server
 * would be same-origin in the deploy, so on both proxies its Origin is
 * rewritten to say so, upgrades included. Anything else keeps its Origin and
 * is still refused. (Not Vite's `rewriteWsOrigin`: that sets the target's
 * origin, the API's own port, which the API refuses.)
 */
function devProxy(env: Record<string, string>): Record<string, ProxyOptions> {
  const ward = new URL(env.WARD_PUBLIC_ORIGIN || "http://localhost:8792").origin;
  const sameOriginAsWard: ProxyOptions["configure"] = (server) => {
    const rewrite = (proxyReq: { setHeader(name: string, value: string): unknown }, req: IncomingMessage) => {
      const origin = req.headers.origin;
      if (origin && URL.canParse(origin) && new URL(origin).host === req.headers.host) {
        proxyReq.setHeader("origin", ward);
      }
    };
    server.on("proxyReq", (proxyReq, req) => rewrite(proxyReq, req));
    server.on("proxyReqWs", (proxyReq, req) => rewrite(proxyReq, req));
  };
  return {
    "/satchel-api": {
      target: `http://127.0.0.1:${env.PORT || 8807}`,
      rewrite: (url) => url.replace(/^\/satchel-api/, ""),
      // Pass WebSocket upgrades through too (brief 12), prefix stripped the same way.
      ws: true,
      configure: sameOriginAsWard,
    },
    "^/ward(-api)?(/|$)": {
      target: ward,
      configure: sameOriginAsWard,
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
        workbox: {
          // The app shell only: HTML, JS, CSS, icons, and the woff2 fonts (the
          // .woff fallbacks are built but never needed by a browser that runs
          // a service worker).
          globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
          navigateFallback: `${base}index.html`,
          // Never answer for the API or Ward. Neither is under the worker's
          // scope (`base`), and with no runtimeCaching their responses are
          // never stored; the denylist keeps it so if the scope ever widens.
          navigateFallbackDenylist: [/^\/satchel-api(\/|$)/, /^\/ward(-api)?(\/|$)/],
          runtimeCaching: [],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    server: { port: 5175, strictPort: true, proxy: devProxy(env) },
    // `vite preview` serves the built app (with its service worker) behind the
    // same proxy, for checking installability locally.
    preview: { port: 4175, strictPort: true, proxy: devProxy(env) },
  };
});

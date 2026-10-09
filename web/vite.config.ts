import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Local dev on one origin, the way Caddy serves the deploy: `/satchel-api` is
 * the API with the prefix stripped, and `/ward` + `/ward-api` are the Ward the
 * API trusts (WARD_PUBLIC_ORIGIN; locally the container on 8792).
 *
 * Ward refuses /refresh and /logout unless the request's Origin is its own. A
 * request from a page on this dev server would be same-origin in the deploy, so
 * its Origin is rewritten to say so. Anything else keeps its Origin and Ward
 * still refuses it.
 */
function devProxy(env: Record<string, string>): Record<string, ProxyOptions> {
  const ward = new URL(env.WARD_PUBLIC_ORIGIN || "http://localhost:8792").origin;
  return {
    "/satchel-api": {
      target: `http://127.0.0.1:${env.PORT || 8807}`,
      rewrite: (url) => url.replace(/^\/satchel-api/, ""),
    },
    "^/ward(-api)?(/|$)": {
      target: ward,
      configure: (server) => {
        server.on("proxyReq", (proxyReq, req) => {
          const origin = req.headers.origin;
          if (origin && URL.canParse(origin) && new URL(origin).host === req.headers.host) {
            proxyReq.setHeader("origin", ward);
          }
        });
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, REPO_ROOT, "");
  return {
    base: process.env.SATCHEL_BASE ?? env.SATCHEL_BASE ?? "/satchel/",
    plugins: [react()],
    server: { port: 5175, strictPort: true, proxy: devProxy(env) },
  };
});

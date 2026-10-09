import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";

/** `src/` (tsx in dev) and `dist/` (built) sit at the same depth, so this resolves the same from both. */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

try {
  process.loadEnvFile(`${REPO_ROOT}.env`);
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 8807);

const app = buildApp();
await app.listen({ host: HOST, port: PORT });

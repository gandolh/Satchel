import { readFileSync } from "node:fs";

/** The guide lives in `src/guide.md`; `src/` and `dist/` both sit one level under the package root, so it is found from either. */
export function renderGuide(packageRoot: URL): string {
  return readFileSync(new URL("src/guide.md", packageRoot), "utf8").trimEnd();
}

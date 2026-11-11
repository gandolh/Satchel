import { createInterface } from "node:readline/promises";
import { createAccounts, createSqliteStore, seedUsers } from "../vendor/ward/ward-auth.js";
import { OWNER_ROLE } from "./auth/guard.js";
import { loadEnvFile, loadSeedConfig, resolveDataDir } from "./config.js";
import { databasePath, openDb } from "./db/open.js";

/**
 * Creates one local user: `npm run seed -w @satchel/server`.
 *
 * Satchel has no Register page, so its local users come from here. The
 * username, password and role come from the environment (`SEED_USERNAME`,
 * `SEED_PASSWORD`, `SEED_ROLE`) or, for what is missing, a prompt on a
 * terminal. They are never read from a file in the repository. A user that
 * already exists is left exactly as it is (no password or role reset), so the
 * script is safe to run on every deploy.
 *
 * `SEED_ROLE` is `admin` (the owner: the Ideas inbox and Claude tokens) or
 * `member` (a friend).
 */

const ROLES = [OWNER_ROLE, "member"];

loadEnvFile();

/** The answer to `question`, with what is typed hidden when `secret`. */
async function ask(question: string, secret = false): Promise<string> {
  if (!process.stdin.isTTY) return "";
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (secret) {
    // Swallow the echo of the typed characters, not the prompt itself.
    const rlWithWrite = rl as unknown as { _writeToOutput: (text: string) => void };
    const original = rlWithWrite._writeToOutput.bind(rl);
    rlWithWrite._writeToOutput = (text) => {
      if (text.startsWith(question)) original(text);
    };
  }
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
    if (secret) process.stdout.write("\n");
  }
}

async function main(): Promise<void> {
  const seed = loadSeedConfig();
  const username = seed.username || (await ask("Username: "));
  const password = seed.password || (await ask("Password: ", true));
  const role = seed.role || (await ask(`Role (${ROLES.join(" or ")}): `));
  if (username === "" || password === "" || role === "") {
    throw new Error("Set SEED_USERNAME, SEED_PASSWORD and SEED_ROLE in the environment, or run this in a terminal.");
  }
  if (!ROLES.includes(role)) throw new Error(`SEED_ROLE must be ${ROLES.join(" or ")}.`);

  // The server's DATA_DIR rule: relative means the repo root's.
  const db = openDb(databasePath(resolveDataDir(seed.dataDir)));
  try {
    const accounts = createAccounts({ store: createSqliteStore(db) });
    const result = await seedUsers(accounts, [{ username, password, role }]);
    console.log(
      result.created.length > 0
        ? `Created ${role} ${result.created.join(", ")}.`
        : `${result.existing.join(", ")} already exists; left as it was.`,
    );
  } finally {
    db.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

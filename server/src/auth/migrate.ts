import { CLAUDE_MEMBER } from "@satchel/shared";
import {
  InvalidUserIdError,
  UserIdTakenError,
  UsernamePolicyError,
  UsernameTakenError,
  WardSubjectTakenError,
  createWardIdentities,
  type Accounts,
} from "../../vendor/ward/ward-auth.js";
import type { Db } from "../db/open.js";
import { OWNER_ROLE } from "./guard.js";

/**
 * Every `accounts.subject` becomes a local user (adoption guide, section 7).
 *
 * Satchel's tables key on `accounts.subject`, which was the Ward subject. The
 * new local user takes that subject as its **id** and is linked to it, so no
 * row is rewritten and a person's next "Sign in with Ward" finds the same
 * account. It runs on every boot and skips what already exists, so it is also
 * how a database written by the old Ward-only version is brought across.
 *
 * It is a function and not an entry of `db/migrations.ts` because the library
 * creates the user and its link (one transaction each, with its own
 * constraints) and the migration list is plain SQL.
 *
 * What the old schema did not store, and what is chosen instead:
 *
 * - **The role.** It came from Ward's grant on every request and was never
 *   written down. The owner is the one account that has an Ideas inbox (the
 *   guard made one for `admin` only), so an account with an `inbox`
 *   conversation becomes `admin` and every other account `member`. Roles live
 *   in the app from now on, and `Accounts.setRole` changes one.
 * - **A local password.** None: the person signs in with Ward, and sets a local
 *   password in Settings.
 *
 * The username is the account's `display_name`, which the guard kept equal to
 * the Ward username. When that is not a valid or free username here (two
 * names that fold to one, say), the user is called `user-<first 8 characters
 * of the subject>`, and the account's display name follows on the next request.
 */

export interface LinkedAccounts {
  /** Subjects that became local users on this run. */
  created: string[];
  /** Created under the `user-<subject>` placeholder because the display name could not be used. */
  placeholders: string[];
  /** Subjects left alone: already linked, or Claude's reserved member name. */
  skipped: string[];
  /** Subjects that could not be migrated, with why. Rows for them stay as they were. */
  failed: { subject: string; reason: string }[];
}

interface AccountRow {
  subject: string;
  display_name: string;
  is_owner: number;
}

export async function linkExistingAccounts(db: Db, accounts: Accounts): Promise<LinkedAccounts> {
  const identities = createWardIdentities({ accounts });
  const rows = db
    .prepare<[], AccountRow>(
      `SELECT a.subject, a.display_name,
              EXISTS (SELECT 1 FROM conversations c WHERE c.kind = 'inbox' AND c.created_by = a.subject) AS is_owner
       FROM accounts a ORDER BY a.created_at, a.subject`,
    )
    .all();
  const result: LinkedAccounts = { created: [], placeholders: [], skipped: [], failed: [] };

  for (const row of rows) {
    const { subject } = row;
    if (subject === CLAUDE_MEMBER || (await identities.findUserBySubject(subject)) !== undefined) {
      result.skipped.push(subject);
      continue;
    }
    const role = row.is_owner === 1 ? OWNER_ROLE : "member";
    // The display name first, then the placeholder, then the placeholder with the whole subject.
    const names = [row.display_name, `user-${subject.slice(0, 8)}`, `user-${subject}`];
    let outcome: "created" | "skipped" | { reason: string } = { reason: "no free username" };
    for (const [index, username] of names.entries()) {
      try {
        await identities.createLinkedUser({ subject, id: subject, username, role });
        outcome = "created";
        if (index > 0) result.placeholders.push(subject);
        break;
      } catch (error) {
        if (error instanceof UsernamePolicyError || error instanceof UsernameTakenError) continue;
        if (error instanceof WardSubjectTakenError) {
          // Linked meanwhile (two boots at once): nothing left to do.
          outcome = "skipped";
        } else if (error instanceof UserIdTakenError) {
          outcome = { reason: "a local user already has this id" };
        } else if (error instanceof InvalidUserIdError) {
          outcome = { reason: "the subject is not usable as a user id" };
        } else {
          throw error;
        }
        break;
      }
    }
    if (outcome === "created") result.created.push(subject);
    else if (outcome === "skipped") result.skipped.push(subject);
    else result.failed.push({ subject, ...outcome });
  }
  return result;
}

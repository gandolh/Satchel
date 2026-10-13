import { CLAUDE_MEMBER, meResponseSchema, routes } from "@satchel/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteStore, createAccounts, createWardIdentities } from "../../vendor/ward/ward-auth.js";
import { openDb, type Db } from "../db/open.js";
import { createStore } from "../store.js";
import { startTestApp, type TestApp } from "../testing/testApp.js";
import { linkExistingAccounts } from "./migrate.js";

/**
 * A database written by the Ward-only version (accounts keyed by Ward
 * subject, an owner with an Ideas inbox, friends without) is brought across:
 * every subject becomes a local user whose id is the subject, linked to it.
 */

const OWNER = "ward-subject-owner-0001";
const FRIEND = "ward-subject-friend-0002";

let t: TestApp;

/** What the old guard wrote on each request: the account, and the owner's inbox. */
function seedOldRows(): { inbox: string; chat: string } {
  t.store.upsertAccount(OWNER, "ana");
  t.store.upsertAccount(FRIEND, "bogdan");
  const inbox = t.store.ensureInbox(OWNER);
  const chat = t.store.createDirect(OWNER, FRIEND).conversation.id;
  t.store.appendMessage({ conversationId: chat, sender: FRIEND, clientId: crypto.randomUUID(), text: "old message" });
  t.store.createClaudeToken(OWNER);
  return { inbox, chat };
}

beforeEach(async () => {
  t = await startTestApp();
});
afterEach(async () => {
  await t.close();
});

describe("linkExistingAccounts", () => {
  it("makes every subject a local user with that id, linked, and the owner an admin", async () => {
    seedOldRows();

    const result = await linkExistingAccounts(t.db, t.accounts);

    expect(result.created.sort()).toEqual([OWNER, FRIEND].sort());
    expect(result).toMatchObject({ placeholders: [], failed: [], skipped: [] });
    expect(await t.accounts.findUserById(OWNER)).toMatchObject({ id: OWNER, username: "ana", role: "admin", hasPassword: false });
    expect(await t.accounts.findUserById(FRIEND)).toMatchObject({ id: FRIEND, username: "bogdan", role: "member" });
    expect((await t.identities.findUserBySubject(OWNER))?.id).toBe(OWNER);
    expect((await t.identities.findUserBySubject(FRIEND))?.id).toBe(FRIEND);
  });

  it("is idempotent: a second run, and a restart, change nothing", async () => {
    seedOldRows();
    await linkExistingAccounts(t.db, t.accounts);
    await t.accounts.setRole(FRIEND, "admin");

    const again = await linkExistingAccounts(t.db, t.accounts);

    expect(again.created).toEqual([]);
    expect(again.skipped.sort()).toEqual([OWNER, FRIEND].sort());
    // The app's row stays the truth: the migration never rewrites a role.
    expect((await t.accounts.findUserById(FRIEND))?.role).toBe("admin");
  });

  it("skips a row whose subject is already a local user id, without reporting a failure", async () => {
    // A locally seeded or registered user: it has an `accounts` row but no Ward link.
    await t.accounts.createUser({ id: OWNER, username: "ana", password: "a-long-local-password-1", role: "admin" });
    t.store.upsertAccount(OWNER, "ana");

    const result = await linkExistingAccounts(t.db, t.accounts);

    expect(result).toEqual({ created: [], placeholders: [], skipped: [OWNER], failed: [] });
    expect(await t.identities.findUserBySubject(OWNER)).toBeUndefined();
  });

  it("never re-links a migrated user who unlinked Ward", async () => {
    seedOldRows();
    await linkExistingAccounts(t.db, t.accounts);
    await t.accounts.setPassword(OWNER, "a-long-local-password-1");
    await t.identities.unlink(OWNER);
    expect(await t.identities.findUserBySubject(OWNER)).toBeUndefined();

    const again = await linkExistingAccounts(t.db, t.accounts);

    expect(again.created).toEqual([]);
    expect(again.failed).toEqual([]);
    expect(again.skipped.sort()).toEqual([OWNER, FRIEND].sort());
    expect(await t.identities.findUserBySubject(OWNER)).toBeUndefined();
  });

  it("keeps every foreign key working: Ward sign-in finds the same account with its chats, messages and tokens", async () => {
    const { inbox, chat } = seedOldRows();
    await linkExistingAccounts(t.db, t.accounts);

    // The migrated owner signs in "with Ward": a session for the linked user.
    const { cookie } = await t.signInWithWard({ subject: OWNER, username: "ana", role: "admin", wardSubject: OWNER });
    const me = await t.app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
    expect(meResponseSchema.parse(me.json())).toEqual({ subject: OWNER, displayName: "ana", inboxId: inbox });

    const list = await t.app.inject({ method: "GET", url: "/api/conversations", headers: { cookie } });
    const ids = routes.listConversations.response.parse(list.json()).conversations.map((c) => c.id);
    expect(ids).toContain(chat);
    expect(ids).toContain(inbox);
    expect(t.store.listMessages(chat).map((m) => m.text)).toEqual(["old message"]);
    expect(t.store.listClaudeTokens(OWNER)).toHaveLength(1);
    expect(t.db.pragma("foreign_key_check")).toEqual([]);
  });

  it("names a user user-<first 8 of the subject> when the display name cannot be kept", async () => {
    // Two names that fold to one username, and one that is not a valid username.
    t.store.upsertAccount("aaaaaaaa-1111", "Ana");
    t.store.upsertAccount("bbbbbbbb-2222", "ana");
    t.store.upsertAccount("cccccccc-3333", "bad\u0007name");

    const result = await linkExistingAccounts(t.db, t.accounts);

    expect(result.failed).toEqual([]);
    expect(result.placeholders.sort()).toEqual(["bbbbbbbb-2222", "cccccccc-3333"]);
    expect((await t.accounts.findUserById("aaaaaaaa-1111"))?.username).toBe("Ana");
    expect((await t.accounts.findUserById("bbbbbbbb-2222"))?.username).toBe("user-bbbbbbbb");
    expect((await t.accounts.findUserById("cccccccc-3333"))?.username).toBe("user-cccccccc");
  });

  it("leaves a row it cannot migrate alone and says why", async () => {
    // A subject with a space cannot be a user id.
    t.store.upsertAccount("not usable", "ana");
    const result = await linkExistingAccounts(t.db, t.accounts);
    expect(result.failed).toEqual([{ subject: "not usable", reason: "the subject is not usable as a user id" }]);
    expect(t.db.prepare("SELECT subject FROM accounts WHERE subject = 'not usable'").all()).toHaveLength(1);
  });

  it("skips Claude's reserved member name and a database with no accounts", async () => {
    expect(await linkExistingAccounts(t.db, t.accounts)).toEqual({ created: [], placeholders: [], skipped: [], failed: [] });
    t.db.prepare("INSERT INTO accounts (subject, display_name, created_at, last_seen_at) VALUES (?, 'Claude', 'x', 'x')").run(CLAUDE_MEMBER);
    expect((await linkExistingAccounts(t.db, t.accounts)).skipped).toEqual([CLAUDE_MEMBER]);
  });

  it("runs on a database opened fresh, with the library's tables beside the app's", async () => {
    const db: Db = openDb(":memory:");
    try {
      createStore(db, () => new Date()).upsertAccount(OWNER, "ana");
      const accounts = createAccounts({ store: createSqliteStore(db) });
      await linkExistingAccounts(db, accounts);
      expect((await createWardIdentities({ accounts }).findUserBySubject(OWNER))?.id).toBe(OWNER);
    } finally {
      db.close();
    }
  });
});

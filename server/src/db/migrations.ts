import type { Database } from "better-sqlite3";

/** Applied in order, each in its own transaction. Never edit a shipped entry; append a new one. */
export const migrations: readonly string[] = [
  `
  CREATE TABLE accounts (
    subject       TEXT PRIMARY KEY,
    display_name  TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL
  );

  CREATE TABLE conversations (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL CHECK (kind IN ('inbox', 'direct', 'group')),
    title       TEXT,
    created_by  TEXT NOT NULL REFERENCES accounts(subject),
    created_at  TEXT NOT NULL
  );
  CREATE UNIQUE INDEX conversations_one_inbox ON conversations(created_by) WHERE kind = 'inbox';

  -- NOT NULL is explicit: SQLite lets a non-INTEGER primary key column hold NULL.
  CREATE TABLE members (
    conversation_id  TEXT NOT NULL REFERENCES conversations(id),
    member           TEXT NOT NULL,
    seen_up_to       INTEGER NOT NULL DEFAULT 0,
    seen_at          TEXT,
    joined_at        TEXT NOT NULL,
    PRIMARY KEY (conversation_id, member)
  );

  CREATE TABLE messages (
    seq              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id  TEXT NOT NULL REFERENCES conversations(id),
    sender           TEXT NOT NULL,
    client_id        TEXT NOT NULL UNIQUE,
    text             TEXT NOT NULL,
    sent_at          TEXT NOT NULL
  );
  CREATE INDEX messages_by_conversation ON messages(conversation_id, seq);

  CREATE TRIGGER messages_no_update BEFORE UPDATE ON messages
  BEGIN
    SELECT RAISE(ABORT, 'messages are append-only');
  END;

  CREATE TRIGGER messages_no_delete BEFORE DELETE ON messages
  BEGIN
    SELECT RAISE(ABORT, 'messages are append-only');
  END;

  CREATE TABLE agent_tokens (
    id               TEXT PRIMARY KEY,
    owner_subject    TEXT NOT NULL REFERENCES accounts(subject),
    conversation_id  TEXT NOT NULL REFERENCES conversations(id),
    token_hash       TEXT NOT NULL UNIQUE,
    created_at       TEXT NOT NULL,
    last_used_at     TEXT,
    revoked_at       TEXT
  );
  `,
];

/** Brings the schema up to `list.length`, tracked in `PRAGMA user_version`. */
export function migrate(db: Database, list: readonly string[] = migrations): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  if (current > list.length) {
    throw new Error(
      `The database is at schema version ${current}, but this server only knows ${list.length}. Run a newer server.`,
    );
  }
  list.slice(current).forEach((sql, index) => {
    const version = current + index + 1;
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();
  });
}

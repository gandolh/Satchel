// Demo data for the README images. Run it against a SCRATCH database only,
// never against data/ in a checkout you use:
//
//   node docs/images/demo-seed.mjs <repo dir> <scratch DATA_DIR> <token file>
//
// Build first (`npm run build`), start the server with DATA_DIR pointing at
// the scratch folder, and sign in once in the browser as the owner, so the
// owner's account and Ideas inbox exist (the first account in the database is
// taken as the owner). The script adds three made-up friends
// (Maya, Theo, Ana) that never sign in, backdated chats, and a Claude token,
// which it writes to <token file> (mode 0600) and never prints. Messages are
// append-only, so to start over, stop the server and delete the scratch folder.
/* global process, console */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [repo, dataDir, tokenFile] = process.argv.slice(2);
const mod = (p) => import(pathToFileURL(join(repo, p)).href);
const { openDb, databasePath } = await mod("server/dist/db/open.js");
const { createStore } = await mod("server/dist/store.js");

let now = new Date();
const at = (daysAgo, hh, mm) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hh, mm, 0, 0);
  now = d;
};
const db = openDb(databasePath(dataDir));
const store = createStore(db, () => now);

const owner = db.prepare("SELECT subject FROM accounts ORDER BY created_at LIMIT 1").get().subject;
const inbox = store.ensureInbox(owner);
const send = (conversationId, sender, text) =>
  store.appendMessage({ conversationId, sender, clientId: randomUUID(), text }).message.seq;

const friends = { maya: "demo-maya", theo: "demo-theo", ana: "demo-ana" };
at(6, 18, 0);
store.upsertAccount(friends.maya, "Maya");
store.upsertAccount(friends.theo, "Theo");
store.upsertAccount(friends.ana, "Ana");

// Everything below runs in time order, so the server seq matches the clock.
at(4, 20, 15);
const theo = store.createDirect(owner, friends.theo).conversation.id;
send(theo, friends.theo, "Finished the book you lent me. The ending was a surprise.");
at(4, 20, 30);
const lastTheo = send(theo, owner, "Glad you liked it. The second one is even better.");
at(4, 20, 41);
store.markSeen(theo, friends.theo, lastTheo);

at(2, 19, 0);
const hike = store.createGroup(owner, "Weekend hike", [friends.maya, friends.theo, friends.ana]).id;
at(2, 19, 4);
send(hike, friends.maya, "Saturday still on? The forecast says dry until 3.");
at(2, 19, 9);
send(hike, friends.theo, "I'm in. Can we start from the north trailhead? Parking is easier there.");
at(2, 19, 15);
send(hike, owner, "Works for me. 8:30 at the trailhead?");
at(2, 19, 22);
send(hike, friends.ana, "8:30 is fine. I'll bring the thermos and a paper map.");

// Ideas inbox: three from yesterday that Claude has read, two from today it hasn't.
at(1, 8, 14);
send(inbox, owner, "Idea: a packing list that remembers what I actually used on the last trip and drops the rest.");
at(1, 9, 2);
send(inbox, owner, "Photo backup script: skip files that are already on the backup drive, compare by hash not by name.");
at(1, 10, 3);
send(hike, friends.maya, "I'll make sandwiches for everyone.");
at(1, 12, 47);
const lastSeenByClaude = send(inbox, owner, "Reading list: show how long each book waited on the shelf before I started it.");
at(1, 21, 10);
store.markSeen(inbox, "claude", lastSeenByClaude);

at(0, 8, 31);
send(inbox, owner, "About the backup script: compare file sizes first and only hash when two sizes match. Much faster.");
at(0, 12, 5);
send(inbox, owner, "Small one: a \"leave by\" reminder that checks the tram times, not just the clock.");
at(0, 13, 40);
const lastHike = send(hike, owner, "Perfect. See you all on Saturday!");
at(0, 13, 52);
store.markSeen(hike, friends.maya, lastHike);
store.markSeen(hike, friends.theo, lastHike);
at(0, 14, 5);
const ana = store.createDirect(owner, friends.ana).conversation.id;
send(ana, friends.ana, "Are you free for coffee on Monday?");
at(0, 14, 6);
send(ana, friends.ana, "The place by the park opens at 9.");

// A Claude token for the CLI. Written to a 0600 scratch file, never printed.
const { token } = store.createClaudeToken(owner);
writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
db.close();
console.log("seeded");

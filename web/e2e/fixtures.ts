import type { Page } from "@playwright/test";

/**
 * The page's stand-in backend: the session, the chats, the messages and the people, answered from fixtures, and a
 * frozen clock, so every run draws the same screen. No Satchel server and no Ward run. The names, messages and times
 * are the redesign board's own comps (the chats list at 16:51, a thread with alma); none is a real account.
 */

/** The browser's clock for every screen: Friday 13 November, 16:51 UTC. The config pins the browser to UTC. */
export const NOW = Date.UTC(2026, 10, 13, 16, 51, 0);

export type SessionState = "signed-in" | "signed-out" | "unreachable" | "loading";
type ListState = "full" | "empty" | "loading" | "error";
export type Role = "owner" | "friend";

const ME = "me";
const ME_NAME = "erin";

/** An ISO time, today (`day` 0) or yesterday (`day` 1), in UTC. */
function at(day: number, time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, 13 - day, h, m)).toISOString();
}

/** `seq` is the server's order, which is the order of the clock. */
function message(seq: number, conversationId: string, sender: string, text: string, day: number, time: string) {
  return {
    seq,
    conversationId,
    sender,
    clientId: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    text,
    sentAt: at(day, time),
  };
}

const member = (id: string, displayName: string, seenUpTo = 0, seenAt: string | null = null) => ({
  id,
  displayName,
  seenUpTo,
  seenAt,
});

const idea = message(4, "inbox", ME, "Idea: a shared packing list for the trip", 0, "15:30");
const aboutSaturday = [
  message(1, "alma", "alma", "Are we still on for Saturday?", 1, "19:20"),
  message(2, "alma", ME, "Yes, around ten at the market.", 1, "19:34"),
  message(5, "alma", "alma", "Perfect, I’ll bring the bags.", 0, "16:05"),
  message(6, "alma", "alma", "Should I get flatbread too?", 0, "16:05"),
  message(7, "alma", ME, "Yes please. Great, see you there.", 0, "16:12"),
];
const lunch = message(9, "cleo", "cleo", "Lunch tomorrow? There is a new place near the station.", 0, "16:51");
const map = message(8, "trip", "cleo", "Thanks Alma! Sending the map now.", 0, "16:40");
const rest = message(3, "boris", "boris", "Can you send the rest tonight?", 0, "14:22");

const lastAlma = aboutSaturday[aboutSaturday.length - 1] ?? idea;

function conversations(role: Role) {
  const inbox = {
    id: "inbox",
    kind: "inbox",
    title: null,
    members: [member(ME, ME_NAME, idea.seq), member("claude", "Claude")],
    lastMessage: idea,
    unreadCount: 0,
  };
  const rest_ = [
    {
      id: "cleo",
      kind: "direct",
      title: null,
      members: [member(ME, ME_NAME), member("cleo", "cleo", lunch.seq)],
      lastMessage: lunch,
      unreadCount: 1,
    },
    {
      id: "trip",
      kind: "group",
      title: "Weekend trip",
      members: [member(ME, ME_NAME), member("alma", "alma"), member("cleo", "cleo"), member("boris", "boris")],
      lastMessage: map,
      unreadCount: 4,
    },
    {
      id: "alma",
      kind: "direct",
      title: null,
      members: [member(ME, ME_NAME, lastAlma.seq), member("alma", "alma", lastAlma.seq, at(0, "16:14"))],
      lastMessage: lastAlma,
      unreadCount: 0,
    },
    {
      id: "boris",
      kind: "direct",
      title: null,
      members: [member(ME, ME_NAME), member("boris", "boris", rest.seq)],
      lastMessage: rest,
      unreadCount: 2,
    },
  ];
  return role === "owner" ? [inbox, ...rest_] : rest_;
}

const PEOPLE = ["alma", "boris", "cleo", "dana"].map((name) => ({ subject: name, displayName: name }));

function sessionBody(state: SessionState) {
  if (state === "signed-in" || state === "loading" || state === "unreachable") {
    return {
      user: { id: ME, username: ME_NAME, displayName: ME_NAME, hasPassword: true },
      session: { origin: "password" },
      ward: { enabled: true, linked: false },
    };
  }
  return { user: null, session: null, ward: { enabled: true, linked: false } };
}

export interface StubOptions {
  session?: SessionState;
  list?: ListState;
  role?: Role;
  /** People on the New chat screen. */
  people?: "some" | "none";
}

/** Routes the page's requests to the fixtures and freezes the clock. Call before `page.goto`. */
export async function stubApi(page: Page, options: StubOptions = {}) {
  const { session = "signed-in", list = "full", role = "owner", people = "some" } = options;
  await page.clock.install({ time: NOW });
  await page.clock.setFixedTime(NOW);

  // The live socket answers nothing and closes: the screens poll the stubs below, which never change.
  await page.routeWebSocket("**/api/live", (socket) => void socket.close({ code: 1006 }));

  await page.route("**/satchel-api/auth/session", (route) => route.fulfill({ json: sessionBody(session) }));
  await page.route("**/satchel-api/api/me", (route) => {
    if (session === "unreachable") return route.abort();
    if (session === "loading") return; // never answered: the gate's "Loading…"
    return route.fulfill({ json: { subject: ME, displayName: ME_NAME, inboxId: role === "owner" ? "inbox" : null } });
  });
  await page.route("**/satchel-api/api/conversations", (route) => {
    if (list === "loading") return;
    if (list === "error") return route.abort();
    return route.fulfill({ json: { conversations: list === "empty" ? [] : conversations(role) } });
  });
  await page.route("**/satchel-api/api/people", (route) =>
    route.fulfill({ json: { people: people === "none" ? [] : PEOPLE } }),
  );
  await page.route("**/satchel-api/api/conversations/*/messages*", (route) => {
    const id = /conversations\/([^/]+)\/messages/.exec(route.request().url())?.[1] ?? "";
    const all = conversations("owner");
    const summary = all.find((c) => c.id === id) ?? all[0];
    if (!summary) return route.abort();
    const messages =
      id === "alma" ? aboutSaturday : id === "inbox" ? [idea] : summary.lastMessage ? [summary.lastMessage] : [];
    return route.fulfill({ json: { conversation: summary, messages, latestSeq: messages.at(-1)?.seq ?? 0 } });
  });
  // Opening a thread moves the seen marker; the stub keeps every badge as drawn.
  await page.route("**/satchel-api/api/conversations/*/seen", (route) =>
    route.fulfill({ json: { seenUpTo: lastAlma.seq } }),
  );
  await page.route("**/satchel-api/api/claude-tokens", (route) =>
    route.fulfill({
      json: { tokens: [{ id: "t1", createdAt: at(3, "09:12"), lastUsedAt: at(0, "15:31"), revokedAt: null }] },
    }),
  );
  await page.route("**/satchel-api/api/push/key", (route) => route.fulfill({ status: 404, json: { error: "off" } }));
}

import { CLAUDE_MEMBER, type ConversationSummary, type Member, type Message } from "@satchel/shared";
import { describe, expect, it } from "vitest";
import {
  applyLiveEvent,
  conversationSubtitle,
  conversationTitle,
  lastMessagePreview,
  sortConversations,
  withNewerMarkers,
} from "./conversation";
import { calendarDaysBetween, listTime } from "./time";

const ME = "sub-me";

function member(id: string, displayName: string, seenUpTo = 0): Member {
  return { id, displayName, seenUpTo, seenAt: null };
}

function message(seq: number, sender: string, text = `message ${seq}`): Message {
  return {
    seq,
    conversationId: "c",
    sender,
    clientId: "6f1c2a4e-8b1d-4c1e-9a3f-2b7d5e6f8a90",
    text,
    sentAt: "2026-10-09T10:00:00.000Z",
  };
}

function conversation(overrides: Partial<ConversationSummary>): ConversationSummary {
  return { id: "c", kind: "direct", title: null, members: [], lastMessage: null, unreadCount: 0, ...overrides };
}

const inbox = conversation({
  id: "inbox",
  kind: "inbox",
  members: [member(ME, "owner"), member(CLAUDE_MEMBER, "Claude")],
});

describe("conversationTitle and conversationSubtitle", () => {
  it("calls the Ideas inbox Claude", () => {
    expect(conversationTitle(inbox, ME)).toBe("Claude");
    expect(conversationSubtitle(inbox, ME)).toBe("Ideas inbox");
  });

  it("names a direct chat after the other member", () => {
    const direct = conversation({ members: [member(ME, "owner"), member("m", "Maria")] });
    expect(conversationTitle(direct, ME)).toBe("Maria");
    expect(conversationSubtitle(direct, ME)).toBe("");
  });

  it("uses a group's title, and lists its members starting with me", () => {
    const group = conversation({
      kind: "group",
      title: "Saturday hike",
      members: [member(ME, "owner"), member("a", "Andrei"), member("m", "Maria")],
    });
    expect(conversationTitle(group, ME)).toBe("Saturday hike");
    expect(conversationSubtitle(group, ME)).toBe("You, Andrei, Maria");
    expect(conversationTitle({ ...group, title: null }, ME)).toBe("Andrei, Maria");
  });
});

describe("a friend's chats", () => {
  const FRIEND = "sub-friend";

  it("titles a direct chat after the other person, whoever started it", () => {
    const direct = conversation({ members: [member("o", "Cristian"), member(FRIEND, "Maria")] });
    expect(conversationTitle(direct, FRIEND)).toBe("Cristian");
    expect(conversationTitle(direct, "o")).toBe("Maria");
  });

  it("lists a friend's chats by latest message with no inbox to pin", () => {
    const quiet = conversation({ id: "quiet", lastMessage: message(3, "x") });
    const busy = conversation({ id: "busy", kind: "group", title: "Hike", lastMessage: message(8, "x") });
    const empty = conversation({ id: "empty" });
    expect(sortConversations([empty, quiet, busy]).map((c) => c.id)).toEqual(["busy", "quiet", "empty"]);
  });
});

describe("lastMessagePreview", () => {
  it("is null with no messages", () => {
    expect(lastMessagePreview(inbox, ME)).toBeNull();
  });

  it("shows my last message with one tick until Claude has seen it, then two", () => {
    const sent = { ...inbox, lastMessage: message(5, ME, "an idea\nover two lines") };
    expect(lastMessagePreview(sent, ME)).toEqual({ sender: "You", text: "an idea over two lines", tick: "sent" });

    const seen = {
      ...sent,
      members: [member(ME, "owner", 5), member(CLAUDE_MEMBER, "Claude", 5)],
    };
    expect(lastMessagePreview(seen, ME)?.tick).toBe("seen");
  });

  it("names the sender in a group, and nobody in a direct chat", () => {
    const members = [member(ME, "owner"), member("a", "Andrei")];
    const group = conversation({ kind: "group", members, lastMessage: message(3, "a", "leaving at 7") });
    expect(lastMessagePreview(group, ME)).toEqual({ sender: "Andrei", text: "leaving at 7", tick: null });
    const direct = conversation({ members, lastMessage: message(3, "a", "ok") });
    expect(lastMessagePreview(direct, ME)).toEqual({ sender: null, text: "ok", tick: null });
  });
});

describe("sortConversations", () => {
  it("pins the inbox first, then orders by latest message", () => {
    const older = conversation({ id: "older", lastMessage: message(2, "x") });
    const newer = conversation({ id: "newer", lastMessage: message(9, "x") });
    const empty = conversation({ id: "empty" });
    const quietInbox = { ...inbox, lastMessage: message(1, ME) };
    expect(sortConversations([older, empty, newer, quietInbox]).map((c) => c.id)).toEqual([
      "inbox",
      "newer",
      "older",
      "empty",
    ]);
  });
});

describe("listTime", () => {
  // Local times, so the test holds in any time zone.
  const now = new Date(2026, 9, 9, 14, 30);

  it("shows the clock for today, then Yesterday, a weekday, a date", () => {
    expect(listTime(new Date(2026, 9, 9, 8, 5).toISOString(), now)).toBe("08:05");
    expect(listTime(new Date(2026, 9, 9, 0, 0).toISOString(), now)).toBe("00:00");
    expect(listTime(new Date(2026, 9, 8, 23, 59).toISOString(), now)).toBe("Yesterday");
    expect(listTime(new Date(2026, 9, 6, 12, 0).toISOString(), now)).toBe("Tue");
    expect(listTime(new Date(2026, 8, 20, 12, 0).toISOString(), now)).toMatch(/^20 Sept?$/);
    expect(listTime(new Date(2025, 11, 31, 12, 0).toISOString(), now)).toBe("31 Dec 2025");
  });

  it("counts calendar days, not 24-hour spans", () => {
    expect(calendarDaysBetween(new Date(2026, 9, 8, 23, 59), new Date(2026, 9, 9, 0, 1))).toBe(1);
    expect(calendarDaysBetween(new Date(2026, 9, 9, 0, 1), new Date(2026, 9, 9, 23, 59))).toBe(0);
  });
});

describe("applyLiveEvent", () => {
  const T = "2026-10-09T10:05:00.000Z";
  const direct = conversation({
    id: "d",
    members: [member(ME, "owner", 3), member("m", "Maria", 3)],
    lastMessage: message(3, "m"),
    unreadCount: 0,
  });
  const list = [inbox, direct];

  it("someone else's message becomes the last message, adds one unread, and moves their marker", () => {
    const { conversations, stale } = applyLiveEvent(
      list,
      { type: "message", conversationId: "d", message: { ...message(8, "m"), conversationId: "d" } },
      ME,
    );
    expect(stale).toBe(false);
    const updated = conversations.find((c) => c.id === "d");
    expect(updated).toMatchObject({ unreadCount: 1, lastMessage: { seq: 8 } });
    expect(updated?.members.find((m) => m.id === "m")?.seenUpTo).toBe(8);
  });

  it("my own message clears my unread count; a message the list already has changes nothing", () => {
    const unread = [inbox, { ...direct, unreadCount: 2 }];
    const mine = applyLiveEvent(unread, { type: "message", conversationId: "d", message: message(9, ME) }, ME);
    expect(mine.conversations.find((c) => c.id === "d")?.unreadCount).toBe(0);

    const old = applyLiveEvent(list, { type: "message", conversationId: "d", message: message(3, "m") }, ME);
    expect(old.conversations).toBe(list);
  });

  it("my marker reaching the last message clears my unread count; short of it, the list is stale", () => {
    const unread = [inbox, { ...direct, lastMessage: message(6, "m"), unreadCount: 3 }];
    const all = applyLiveEvent(unread, { type: "seen", conversationId: "d", member: ME, seenUpTo: 6, seenAt: T }, ME);
    expect(all).toMatchObject({ stale: false });
    expect(all.conversations.find((c) => c.id === "d")?.unreadCount).toBe(0);

    const some = applyLiveEvent(unread, { type: "seen", conversationId: "d", member: ME, seenUpTo: 4, seenAt: T }, ME);
    expect(some.stale).toBe(true);
  });

  it("another member's seen moves only their marker, forward only", () => {
    const seen = applyLiveEvent(list, { type: "seen", conversationId: "d", member: "m", seenUpTo: 5, seenAt: T }, ME);
    expect(seen.conversations.find((c) => c.id === "d")?.members.find((m) => m.id === "m")).toMatchObject({
      seenUpTo: 5,
      seenAt: T,
    });
    const back = applyLiveEvent(list, { type: "seen", conversationId: "d", member: "m", seenUpTo: 1, seenAt: T }, ME);
    expect(back.conversations).toBe(list);
  });

  it("a new conversation is added in order; an event for one the list lacks is stale", () => {
    const fresh = conversation({ id: "new", members: [member(ME, "owner"), member("a", "Andrei")] });
    const added = applyLiveEvent(list, { type: "conversation", conversation: fresh }, ME);
    expect(added.conversations.map((c) => c.id)).toEqual(["inbox", "d", "new"]);

    const unknown = applyLiveEvent(list, { type: "message", conversationId: "x", message: message(10, "a") }, ME);
    expect(unknown).toEqual({ conversations: list, stale: true });
  });
});

describe("withNewerMarkers", () => {
  it("keeps the higher marker of two answers, whichever is older", () => {
    const T = "2026-10-09T10:05:00.000Z";
    const older = conversation({ members: [member(ME, "owner", 2), member("m", "Maria", 7)] });
    const newer = conversation({ members: [member(ME, "owner", 5), { ...member("m", "Maria", 4), seenAt: T }] });
    const merged = withNewerMarkers(older, { ...newer, members: newer.members.map((m) => ({ ...m, seenAt: T })) });
    expect(merged.members.map((m) => m.seenUpTo)).toEqual([5, 7]);
  });
});

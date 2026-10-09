import { CLAUDE_MEMBER, type ConversationSummary, type Member, type Message } from "@satchel/shared";
import { describe, expect, it } from "vitest";
import { conversationSubtitle, conversationTitle, lastMessagePreview, sortConversations } from "./conversation";
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

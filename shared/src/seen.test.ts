import { describe, expect, it } from "vitest";
import { CLAUDE_MEMBER } from "./limits.js";
import type { Member } from "./model.js";
import { isSeenBy, nextSeenUpTo, seenLine, tickState, unreadCount } from "./seen.js";

const ME = "owner";

function member(id: string, seenUpTo: number, displayName = id): Member {
  return { id, displayName, seenUpTo, seenAt: seenUpTo > 0 ? "2026-10-09T21:40:00.000Z" : null };
}

function msg(seq: number, sender: string) {
  return { seq, sender };
}

describe("nextSeenUpTo", () => {
  it("moves forward to the requested seq", () => {
    expect(nextSeenUpTo(3, 7, 10)).toBe(7);
  });

  it("keeps the marker when the request is lower", () => {
    expect(nextSeenUpTo(7, 3, 10)).toBe(7);
  });

  it("clamps to the latest seq", () => {
    expect(nextSeenUpTo(3, 99, 10)).toBe(10);
    expect(nextSeenUpTo(0, 5, 0)).toBe(0);
  });

  it("never decreases and never passes the latest seq", () => {
    for (let latest = 0; latest <= 6; latest++) {
      for (let current = 0; current <= latest; current++) {
        for (let requested = 0; requested <= 8; requested++) {
          const next = nextSeenUpTo(current, requested, latest);
          expect(next).toBeGreaterThanOrEqual(current);
          expect(next).toBeLessThanOrEqual(latest);
        }
      }
    }
  });
});

describe("isSeenBy", () => {
  it("is true at or below the marker", () => {
    expect(isSeenBy(member("a", 5), 5)).toBe(true);
    expect(isSeenBy(member("a", 5), 4)).toBe(true);
    expect(isSeenBy(member("a", 5), 6)).toBe(false);
  });
});

describe("tickState", () => {
  it("in a two-member inbox, turns seen when Claude's marker reaches the message", () => {
    const mine = msg(42, ME);
    expect(tickState(mine, [member(ME, 42), member(CLAUDE_MEMBER, 41)], ME)).toBe("sent");
    expect(tickState(mine, [member(ME, 42), member(CLAUDE_MEMBER, 42)], ME)).toBe("seen");
    expect(tickState(mine, [member(ME, 42), member(CLAUDE_MEMBER, 50)], ME)).toBe("seen");
  });

  it("in a four-member group, stays sent until every other member has it", () => {
    const mine = msg(10, ME);
    const group = [member(ME, 10), member("maria", 10), member("andrei", 12), member("ioana", 9)];
    expect(tickState(mine, group, ME)).toBe("sent");
    const allSeen = [member(ME, 10), member("maria", 10), member("andrei", 12), member("ioana", 10)];
    expect(tickState(mine, allSeen, ME)).toBe("seen");
  });

  it("ignores the sender's own marker", () => {
    const mine = msg(10, ME);
    expect(tickState(mine, [member(ME, 0), member("maria", 10)], ME)).toBe("seen");
  });

  it("is sent when there is no other member to have seen it", () => {
    expect(tickState(msg(1, ME), [member(ME, 1)], ME)).toBe("sent");
    expect(tickState(msg(1, ME), [], ME)).toBe("sent");
  });
});

describe("seenLine", () => {
  it("in the inbox, points at my newest message Claude has seen, with Claude's seenAt", () => {
    const messages = [msg(39, ME), msg(40, ME), msg(44, ME)];
    const claude = { ...member(CLAUDE_MEMBER, 42, "Claude"), seenAt: "2026-10-09T21:40:00.000Z" };
    expect(seenLine(messages, [member(ME, 44), claude], ME)).toEqual({
      kind: "seen",
      seq: 40,
      seenAt: "2026-10-09T21:40:00.000Z",
    });
  });

  it("in the inbox, is null when Claude hasn't seen any of my messages", () => {
    const messages = [msg(39, ME), msg(40, ME)];
    expect(seenLine(messages, [member(ME, 40), member(CLAUDE_MEMBER, 0)], ME)).toBeNull();
    expect(seenLine(messages, [member(ME, 40), member(CLAUDE_MEMBER, 38)], ME)).toBeNull();
  });

  it("is null when I have sent nothing", () => {
    expect(seenLine([], [member(ME, 0), member(CLAUDE_MEMBER, 5)], ME)).toBeNull();
    const group = [member(ME, 3), member("maria", 3), member("andrei", 3)];
    expect(seenLine([msg(3, "maria")], group, ME)).toBeNull();
  });

  it("in a direct chat, skips the other member's messages", () => {
    const messages = [msg(5, ME), msg(6, "maria"), msg(7, ME)];
    expect(seenLine(messages, [member(ME, 7), member("maria", 6, "Maria")], ME)).toMatchObject({
      kind: "seen",
      seq: 5,
    });
  });

  it("in a group, names the members whose marker is at or above my last message", () => {
    const messages = [msg(5, ME), msg(8, ME), msg(9, "ioana")];
    const group = [
      member(ME, 8, "Owner"),
      member("maria", 8, "Maria"),
      member("andrei", 10, "Andrei"),
      member("ioana", 9, "Ioana"),
      member("dan", 7, "Dan"),
    ];
    expect(seenLine(messages, group, ME)).toEqual({
      kind: "seenBy",
      seq: 8,
      names: ["Maria", "Andrei", "Ioana"],
    });
  });

  it("in a group, is null when nobody has reached my last message", () => {
    const messages = [msg(5, ME), msg(8, ME)];
    const group = [member(ME, 8), member("maria", 7), member("andrei", 5)];
    expect(seenLine(messages, group, ME)).toBeNull();
  });
});

describe("unreadCount", () => {
  it("counts messages above the marker that the member didn't send", () => {
    const messages = [msg(1, ME), msg(2, CLAUDE_MEMBER), msg(3, ME), msg(4, "maria"), msg(5, ME)];
    expect(unreadCount(messages, member(CLAUDE_MEMBER, 2))).toBe(3);
    expect(unreadCount(messages, member(CLAUDE_MEMBER, 5))).toBe(0);
    expect(unreadCount(messages, member(ME, 1))).toBe(2);
    expect(unreadCount([], member(ME, 0))).toBe(0);
  });
});

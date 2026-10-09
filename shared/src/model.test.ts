import { describe, expect, it } from "vitest";
import { CLAUDE_MEMBER, MAX_TEXT_LENGTH } from "./limits.js";
import {
  conversationSummarySchema,
  memberSchema,
  messageSchema,
  messageTextSchema,
  personSchema,
} from "./model.js";

const message = {
  seq: 41,
  conversationId: "c1",
  sender: "owner",
  clientId: "6f1c9d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f",
  text: "Warmup timer that counts down per exercise",
  sentAt: "2026-10-09T08:12:00.000Z",
};

describe("messageTextSchema", () => {
  it("rejects empty text", () => {
    expect(messageTextSchema.safeParse("").success).toBe(false);
  });

  it("rejects whitespace-only text", () => {
    expect(messageTextSchema.safeParse("  \n\t \r\n ").success).toBe(false);
  });

  it(`accepts ${MAX_TEXT_LENGTH} characters and rejects ${MAX_TEXT_LENGTH + 1}`, () => {
    expect(messageTextSchema.safeParse("a".repeat(MAX_TEXT_LENGTH)).success).toBe(true);
    expect(messageTextSchema.safeParse("a".repeat(MAX_TEXT_LENGTH + 1)).success).toBe(false);
  });

  it("normalises \\r\\n and lone \\r to \\n", () => {
    expect(messageTextSchema.parse("one\r\ntwo\rthree\nfour")).toBe("one\ntwo\nthree\nfour");
  });

  it("measures the length after normalising", () => {
    const pasted = `${"a".repeat(MAX_TEXT_LENGTH - 1)}\r\n`;
    expect(messageTextSchema.parse(pasted)).toHaveLength(MAX_TEXT_LENGTH);
  });

  it("keeps leading and trailing whitespace", () => {
    expect(messageTextSchema.parse("  idea  \n")).toBe("  idea  \n");
  });

  it("rejects a non-string", () => {
    expect(messageTextSchema.safeParse(42).success).toBe(false);
  });
});

describe("messageSchema", () => {
  it("parses a stored message", () => {
    expect(messageSchema.parse(message)).toEqual(message);
  });

  it("requires a positive seq, a UUID client ID and an ISO time", () => {
    expect(messageSchema.safeParse({ ...message, seq: 0 }).success).toBe(false);
    expect(messageSchema.safeParse({ ...message, seq: 1.5 }).success).toBe(false);
    expect(messageSchema.safeParse({ ...message, clientId: "abc" }).success).toBe(false);
    expect(messageSchema.safeParse({ ...message, sentAt: "yesterday" }).success).toBe(false);
  });
});

describe("memberSchema", () => {
  it("accepts a fresh member with marker 0 and no seenAt", () => {
    const fresh = { id: CLAUDE_MEMBER, displayName: "Claude", seenUpTo: 0, seenAt: null };
    expect(memberSchema.parse(fresh)).toEqual(fresh);
  });

  it("rejects a negative marker", () => {
    const member = { id: "owner", displayName: "Owner", seenUpTo: -1, seenAt: null };
    expect(memberSchema.safeParse(member).success).toBe(false);
  });
});

describe("conversationSummarySchema", () => {
  it("parses an empty inbox with a null title", () => {
    const inbox = {
      id: "c1",
      kind: "inbox",
      title: null,
      members: [
        { id: "owner", displayName: "Owner", seenUpTo: 0, seenAt: null },
        { id: CLAUDE_MEMBER, displayName: "Claude", seenUpTo: 0, seenAt: null },
      ],
      lastMessage: null,
      unreadCount: 0,
    };
    expect(conversationSummarySchema.parse(inbox)).toEqual(inbox);
  });

  it("rejects an unknown kind", () => {
    const summary = {
      id: "c1",
      kind: "channel",
      title: null,
      members: [],
      lastMessage: message,
      unreadCount: 0,
    };
    expect(conversationSummarySchema.safeParse(summary).success).toBe(false);
  });
});

describe("personSchema", () => {
  it("parses a subject and a display name", () => {
    const person = { subject: "subject-b", displayName: "bogdan" };
    expect(personSchema.parse(person)).toEqual(person);
  });

  it("rejects an empty subject", () => {
    expect(personSchema.safeParse({ subject: "", displayName: "bogdan" }).success).toBe(false);
  });
});

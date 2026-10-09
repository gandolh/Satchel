import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import {
  CLAUDE_MEMBER,
  ERROR_CODES,
  ERROR_STATUS,
  GROUP_MEMBERS_MAX,
  GROUP_TITLE_MAX_LENGTH,
  PAGE_LIMIT_DEFAULT,
  PAGE_LIMIT_MAX,
  apiError,
  claudeMessagesQuerySchema,
  claudeTokenSummarySchema,
  claudeUnreadMessageSchema,
  createConversationRequestSchema,
  errorResponseSchema,
  meResponseSchema,
  messagesQuerySchema,
  routes,
  sendMessageRequestSchema,
  type Route,
  type RouteName,
} from "./index.js";

const at = "2026-10-09T08:12:00.000Z";
const clientId = "6f1c9d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f";
const message = { seq: 41, conversationId: "c1", sender: "owner", clientId, text: "idea", sentAt: at };
const inbox = {
  id: "c1",
  kind: "inbox",
  title: null,
  members: [
    { id: "owner", displayName: "Owner", seenUpTo: 41, seenAt: at },
    { id: CLAUDE_MEMBER, displayName: "Claude", seenUpTo: 38, seenAt: at },
  ],
  lastMessage: message,
  unreadCount: 0,
};

interface Sample {
  route: string;
  auth: Route["auth"];
  params?: unknown;
  query?: unknown;
  body?: unknown;
  response: unknown;
}

const samples: Record<RouteName, Sample> = {
  health: { route: "GET /api/health", auth: "none", response: { ok: true } },
  me: {
    route: "GET /api/me",
    auth: "ward",
    response: { subject: "owner", displayName: "Owner", inboxId: "c1" },
  },
  listConversations: {
    route: "GET /api/conversations",
    auth: "ward",
    response: { conversations: [inbox] },
  },
  createConversation: {
    route: "POST /api/conversations",
    auth: "ward",
    body: { kind: "group", title: "Hike on Saturday", members: ["friend-b", "friend-c"] },
    response: {
      conversation: {
        id: "c2",
        kind: "group",
        title: "Hike on Saturday",
        members: [
          { id: "owner", displayName: "Owner", seenUpTo: 0, seenAt: null },
          { id: "friend-b", displayName: "Bogdan", seenUpTo: 0, seenAt: null },
          { id: "friend-c", displayName: "Cora", seenUpTo: 0, seenAt: null },
        ],
        lastMessage: null,
        unreadCount: 0,
      },
    },
  },
  listPeople: {
    route: "GET /api/people",
    auth: "ward",
    response: { people: [{ subject: "friend-b", displayName: "Bogdan" }] },
  },
  listMessages: {
    route: "GET /api/conversations/:id/messages",
    auth: "ward",
    params: { id: "c1" },
    query: { after: "40", limit: "50" },
    response: { conversation: inbox, messages: [message], latestSeq: 41 },
  },
  sendMessage: {
    route: "POST /api/conversations/:id/messages",
    auth: "ward",
    params: { id: "c1" },
    body: { clientId, text: "idea" },
    response: { message },
  },
  markSeen: {
    route: "POST /api/conversations/:id/seen",
    auth: "ward",
    params: { id: "c1" },
    body: { upTo: 41 },
    response: { seenUpTo: 41 },
  },
  listClaudeTokens: {
    route: "GET /api/claude-tokens",
    auth: "ward",
    response: {
      tokens: [
        { id: "t2", createdAt: at, lastUsedAt: null, revokedAt: null },
        { id: "t1", createdAt: at, lastUsedAt: at, revokedAt: at },
      ],
    },
  },
  createClaudeToken: {
    route: "POST /api/claude-tokens",
    auth: "ward",
    response: { id: "t3", token: "stl_not-a-real-token", createdAt: at },
  },
  revokeClaudeToken: {
    route: "POST /api/claude-tokens/:id/revoke",
    auth: "ward",
    params: { id: "t1" },
    response: { id: "t1", revokedAt: at },
  },
  claudeUnread: {
    route: "GET /claude/unread",
    auth: "claude",
    response: { seenUpTo: 38, messages: [{ seq: 39, sentAt: at, text: "idea" }] },
  },
  claudeSeen: {
    route: "POST /claude/seen",
    auth: "claude",
    body: { upTo: 39 },
    response: { seenUpTo: 39 },
  },
  claudeMessages: {
    route: "GET /claude/messages",
    auth: "claude",
    query: { after: "0", since: "2026-10-01", limit: "10" },
    response: { messages: [{ seq: 39, sentAt: at, text: "idea", seen: true }] },
  },
};

describe("routes", () => {
  for (const name of Object.keys(samples) as RouteName[]) {
    const sample = samples[name];
    const route: Route = routes[name];

    it(`${name} is ${sample.route} with ${sample.auth} auth`, () => {
      expect(`${route.method} ${route.path}`).toBe(sample.route);
      expect(route.auth).toBe(sample.auth);
    });

    it(`${name} parses a sample request and response`, () => {
      for (const part of ["params", "query", "body"] as const) {
        const schema = route[part];
        expect(schema === undefined, `${name}.${part}`).toBe(sample[part] === undefined);
        if (schema) expect(schema.safeParse(sample[part]).error).toBeUndefined();
      }
      expect(route.response.safeParse(sample.response).error).toBeUndefined();
    });
  }

  it("has a sample for every route", () => {
    expect(Object.keys(samples).sort()).toEqual(Object.keys(routes).sort());
  });
});

describe("meResponseSchema", () => {
  it("allows a null inbox, for a friend", () => {
    const friend = { subject: "friend-b", displayName: "Bogdan", inboxId: null };
    expect(meResponseSchema.parse(friend)).toEqual(friend);
    expect(meResponseSchema.safeParse({ subject: "friend-b", displayName: "Bogdan" }).success).toBe(false);
  });
});

describe("createConversationRequestSchema", () => {
  const parse = (body: unknown) => createConversationRequestSchema.safeParse(body);
  const members = ["friend-b", "friend-c"];

  it("takes a direct body", () => {
    expect(parse({ kind: "direct", with: "friend-b" }).data).toEqual({ kind: "direct", with: "friend-b" });
  });

  it("takes a group body and trims the title", () => {
    expect(parse({ kind: "group", title: "  Hike  ", members }).data).toEqual({
      kind: "group",
      title: "Hike",
      members,
    });
  });

  it("accepts a title of 1 and 80 characters and 2 and 20 members", () => {
    const twenty = Array.from({ length: GROUP_MEMBERS_MAX }, (_, i) => `friend-${String(i)}`);
    expect(parse({ kind: "group", title: "x", members }).success).toBe(true);
    expect(parse({ kind: "group", title: "x".repeat(GROUP_TITLE_MAX_LENGTH), members: twenty }).success).toBe(true);
  });

  it.each([
    ["no kind", { with: "friend-b" }],
    ["an inbox", { kind: "inbox" }],
    ["a direct body with no one", { kind: "direct" }],
    ["a direct body with an empty subject", { kind: "direct", with: "" }],
    ["a group with no title", { kind: "group", members }],
    ["a group with a blank title", { kind: "group", title: "   ", members }],
    ["a group title of 81 characters", { kind: "group", title: "x".repeat(GROUP_TITLE_MAX_LENGTH + 1), members }],
    ["a group with no members", { kind: "group", title: "Hike" }],
    ["a group with one member", { kind: "group", title: "Hike", members: ["friend-b"] }],
    [
      "a group with 21 members",
      { kind: "group", title: "Hike", members: Array.from({ length: 21 }, (_, i) => `friend-${String(i)}`) },
    ],
    ["a group listing a member twice", { kind: "group", title: "Hike", members: ["friend-b", "friend-b"] }],
    ["a group with an empty subject", { kind: "group", title: "Hike", members: ["friend-b", ""] }],
  ])("rejects %s", (_label, body) => {
    expect(parse(body).success).toBe(false);
  });
});

describe("paging queries", () => {
  it("default after to 0 and limit to the page default", () => {
    expect(messagesQuerySchema.parse({})).toEqual({ after: 0, limit: PAGE_LIMIT_DEFAULT });
  });

  it("coerce query-string numbers", () => {
    expect(messagesQuerySchema.parse({ after: "12", limit: "3" })).toEqual({ after: 12, limit: 3 });
  });

  it("reject a limit outside 1 to the page max, and a bad after", () => {
    expect(messagesQuerySchema.safeParse({ limit: String(PAGE_LIMIT_MAX) }).success).toBe(true);
    expect(messagesQuerySchema.safeParse({ limit: String(PAGE_LIMIT_MAX + 1) }).success).toBe(false);
    expect(messagesQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(messagesQuerySchema.safeParse({ after: "-1" }).success).toBe(false);
    expect(messagesQuerySchema.safeParse({ after: "abc" }).success).toBe(false);
    expect(messagesQuerySchema.safeParse({ after: "1.5" }).success).toBe(false);
  });
});

describe("claudeMessagesQuerySchema since", () => {
  it("turns a bare date into midnight UTC", () => {
    expect(claudeMessagesQuerySchema.parse({ since: "2026-10-01" }).since).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });

  it("normalises a date-time with an offset to UTC", () => {
    expect(claudeMessagesQuerySchema.parse({ since: "2026-10-01T08:00:00+03:00" }).since).toBe(
      "2026-10-01T05:00:00.000Z",
    );
  });

  it("is optional and rejects anything that isn't an ISO date or date-time", () => {
    expect(claudeMessagesQuerySchema.parse({}).since).toBeUndefined();
    expect(claudeMessagesQuerySchema.safeParse({ since: "last week" }).success).toBe(false);
    expect(claudeMessagesQuerySchema.safeParse({ since: "2026-02-30" }).success).toBe(false);
  });
});

describe("sendMessageRequestSchema", () => {
  it("normalises the text and requires a UUID client ID", () => {
    expect(sendMessageRequestSchema.parse({ clientId, text: "a\r\nb" }).text).toBe("a\nb");
    expect(sendMessageRequestSchema.safeParse({ clientId: "1", text: "a" }).success).toBe(false);
    expect(sendMessageRequestSchema.safeParse({ clientId, text: " " }).success).toBe(false);
  });
});

describe("what Claude and Settings never see", () => {
  it("a Claude message carrying sender or clientId fails to parse", () => {
    const view = { seq: 39, sentAt: at, text: "idea" };
    expect(claudeUnreadMessageSchema.safeParse(view).success).toBe(true);
    expect(claudeUnreadMessageSchema.safeParse({ ...view, sender: "owner" }).success).toBe(false);
    expect(claudeUnreadMessageSchema.safeParse({ ...view, clientId }).success).toBe(false);
    expect(
      routes.claudeUnread.response.safeParse({ seenUpTo: 0, messages: [message] }).success,
    ).toBe(false);
  });

  it("a token summary carrying the token or its hash fails to parse", () => {
    const summary = { id: "t1", createdAt: at, lastUsedAt: null, revokedAt: null };
    expect(claudeTokenSummarySchema.safeParse({ ...summary, token: "stl_x" }).success).toBe(false);
    expect(claudeTokenSummarySchema.safeParse({ ...summary, tokenHash: "ab" }).success).toBe(false);
  });
});

describe("errors", () => {
  it("apiError builds the shared error shape", () => {
    const body = apiError("not_found", "No such conversation.");
    expect(body).toEqual({ error: { code: "not_found", message: "No such conversation." } });
    expect(errorResponseSchema.parse(body)).toEqual(body);
  });

  it("maps every code to its HTTP status", () => {
    expect(Object.keys(ERROR_STATUS).sort()).toEqual([...ERROR_CODES].sort());
    expect(ERROR_STATUS).toEqual({
      unauthorized: 401,
      forbidden: 403,
      not_found: 404,
      invalid_request: 400,
      client_id_conflict: 409,
      unavailable: 503,
      internal: 500,
    });
  });

  it("rejects an unknown code", () => {
    expect(errorResponseSchema.safeParse({ error: { code: "teapot", message: "" } }).success).toBe(
      false,
    );
  });
});

describe("inferred types", () => {
  it("keep each route's own schemas", () => {
    expectTypeOf<z.infer<typeof routes.listMessages.query>>().toEqualTypeOf<{
      after: number;
      limit: number;
    }>();
    expectTypeOf<z.input<typeof routes.listMessages.query>>().toEqualTypeOf<{
      after?: number | undefined;
      limit?: number | undefined;
    }>();
    expectTypeOf<z.infer<typeof routes.claudeMessages.query>["since"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf(routes.sendMessage.method).toEqualTypeOf<"POST">();
  });
});

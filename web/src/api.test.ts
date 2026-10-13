import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `ward.ts` pulls in the auth hooks; the gate's `sessionEnded` is all these tests need to see called.
const sessionEnded = vi.hoisted(() => vi.fn());
vi.mock("./ward", () => ({ sessionEnded }));

import {
  ApiError,
  createClaudeToken,
  createConversation,
  deletePushSubscription,
  getMe,
  getPushKey,
  listClaudeTokens,
  listPeople,
  listConversations,
  listMessages,
  NetworkError,
  onAuthEvent,
  revokeClaudeToken,
  savePushSubscription,
  sendMessage,
  SignedOut,
  Unavailable,
  urlFor,
  type AuthEvent,
} from "./api";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function apiError(status: number, code: string, message = code): Response {
  return json(status, { error: { code, message } });
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

let events: AuthEvent[];
let stopListening: () => void;
let calls: { url: string; init: RequestInit }[];

function serve(handler: Handler): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      calls.push({ url: input, init });
      return handler(input, init);
    }),
  );
}

function callsTo(url: string): number {
  return calls.filter((call) => call.url === url).length;
}

beforeEach(() => {
  sessionEnded.mockClear();
  calls = [];
  events = [];
  stopListening = onAuthEvent((event) => events.push(event));
  vi.stubEnv("BASE_URL", "/satchel/");
  vi.stubGlobal("window", { location: { pathname: "/satchel/c/abc", search: "" } });
});

afterEach(() => {
  stopListening();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("a 401", () => {
  it("means the session is over: SignedOut, the auth gate told, and no retry or redirect", async () => {
    serve(() => apiError(401, "unauthorized"));

    await expect(listConversations()).rejects.toBeInstanceOf(SignedOut);
    expect(callsTo("/satchel-api/api/conversations")).toBe(1);
    expect(events).toEqual(["signed-out"]);
    expect(sessionEnded).toHaveBeenCalledOnce();
    // The only calls are to the API: nothing goes to Ward, and nothing renews.
    expect(calls.map((call) => call.url)).toEqual(["/satchel-api/api/conversations"]);
  });

  it("is the plugin's own body too: `{ error: \"unauthorized\" }` is not Satchel's error shape", async () => {
    serve(() => json(401, { error: "unauthorized", reason: "ward_session_ended" }));
    await expect(getMe()).rejects.toBeInstanceOf(SignedOut);
    expect(sessionEnded).toHaveBeenCalledOnce();
  });
});

describe("errors", () => {
  it("treats a 403 from any other route as an ordinary ApiError, without locking the app", async () => {
    serve(() => apiError(403, "forbidden", "Only Satchel's owner can connect Claude."));
    const error = await listClaudeTokens().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("forbidden");
    expect((error as ApiError).message).toBe("Only Satchel's owner can connect Claude.");
    expect(events).toEqual([]);
  });

  it("posts a direct chat and a group, and lists people", async () => {
    serve((url) =>
      url === "/satchel-api/api/people"
        ? json(200, { people: [{ subject: "s2", displayName: "Maria" }] })
        : json(201, { conversation: { id: "c1", kind: "direct", title: null, members: [], lastMessage: null, unreadCount: 0 } }),
    );
    expect((await listPeople()).people).toEqual([{ subject: "s2", displayName: "Maria" }]);
    expect((await createConversation({ kind: "direct", with: "s2" })).conversation.id).toBe("c1");
    const post = calls.at(-1);
    expect(post?.url).toBe("/satchel-api/api/conversations");
    expect(post?.init.method).toBe("POST");
    expect(post?.init.body).toBe(JSON.stringify({ kind: "direct", with: "s2" }));
  });

  it("treats a 403 from /api/me like any other: an ApiError, no event", async () => {
    serve(() => apiError(403, "forbidden", "Not for you."));
    const error = await getMe().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(events).toEqual([]);
    expect(sessionEnded).not.toHaveBeenCalled();
  });

  it("raises Unavailable on a 503", async () => {
    serve(() => apiError(503, "unavailable", "Ward, the sign-in service, is not answering."));
    const error = await getMe().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Unavailable);
    expect((error as Unavailable).message).toBe("Ward, the sign-in service, is not answering.");
  });

  it("keys on the code, so a 413 invalid_request is an ApiError with the server's message", async () => {
    serve(() => apiError(413, "invalid_request", "Request body is too large"));
    const error = await sendMessage("c1", { clientId: crypto.randomUUID(), text: "hi" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(Unavailable);
    expect((error as ApiError).code).toBe("invalid_request");
    expect((error as ApiError).status).toBe(413);
    expect((error as ApiError).message).toBe("Request body is too large");
  });

  it("gives a body that isn't Satchel's a null code", async () => {
    serve(() => new Response("<html>502</html>", { status: 502 }));
    const error = await getMe().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBeNull();
  });

  it("rejects a 2xx that doesn't match the shared schema", async () => {
    serve(() => json(200, { subject: "s" }));
    await expect(getMe()).rejects.toBeInstanceOf(ApiError);
  });

  it("wraps a failed fetch in NetworkError", async () => {
    serve(() => {
      throw new TypeError("fetch failed");
    });
    await expect(getMe()).rejects.toBeInstanceOf(NetworkError);
  });

  it("rethrows an abort unchanged", async () => {
    const controller = new AbortController();
    serve(() => {
      controller.abort(new DOMException("timed out", "TimeoutError"));
      throw new DOMException("aborted", "AbortError");
    });
    const error = await getMe({ signal: controller.signal }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("TimeoutError");
  });
});

describe("requests", () => {
  const message = {
    seq: 7,
    conversationId: "c1",
    sender: "sub-1",
    clientId: "6f1c2a4e-8b1d-4c1e-9a3f-2b7d5e6f8a90",
    text: "hello",
    sentAt: "2026-10-09T10:00:00.000Z",
  };

  it("posts JSON to the conversation's messages", async () => {
    serve(() => json(201, { message }));
    await expect(sendMessage("c 1", { clientId: message.clientId, text: "hello" })).resolves.toEqual({ message });
    const sent = calls[0];
    expect(sent?.url).toBe("/satchel-api/api/conversations/c%201/messages");
    expect(sent?.init.method).toBe("POST");
    expect(sent?.init.credentials).toBe("same-origin");
    expect((sent?.init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(String(sent?.init.body))).toEqual({ clientId: message.clientId, text: "hello" });
  });

  it("sends no body and no content type on a body-less POST", async () => {
    serve(() => json(201, { id: "t1", token: "stl_abc", createdAt: "2026-10-09T10:00:00.000Z" }));
    await createClaudeToken();
    const sent = calls[0];
    expect(sent?.url).toBe("/satchel-api/api/claude-tokens");
    expect(sent?.init.method).toBe("POST");
    expect(sent?.init.body).toBeUndefined();
    expect((sent?.init.headers as Record<string, string>)["content-type"]).toBeUndefined();
  });

  it("fills the token id and builds the messages query", async () => {
    serve((url) =>
      url.includes("revoke")
        ? json(200, { id: "t/1", revokedAt: "2026-10-09T10:00:00.000Z" })
        : json(200, { conversation: { id: "c1", kind: "inbox", title: null, members: [], lastMessage: null, unreadCount: 0 }, messages: [], latestSeq: 0 }),
    );
    await revokeClaudeToken("t/1");
    await listMessages("c1", { after: 5 });
    await listMessages("c1");
    expect(calls.map((call) => call.url)).toEqual([
      "/satchel-api/api/claude-tokens/t%2F1/revoke",
      "/satchel-api/api/conversations/c1/messages?after=5",
      "/satchel-api/api/conversations/c1/messages",
    ]);
  });

  it("gets the push key, saves a subscription and deletes one by endpoint", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/not-real";
    const keys = { p256dh: `B${"A".repeat(86)}`, auth: "A".repeat(22) };
    serve((url) => (url.endsWith("/key") ? json(200, { publicKey: "BPUB" }) : json(201, { ok: true })));

    await expect(getPushKey()).resolves.toEqual({ publicKey: "BPUB" });
    await expect(savePushSubscription({ endpoint, expirationTime: null, keys })).resolves.toEqual({ ok: true });
    await expect(deletePushSubscription(endpoint)).resolves.toEqual({ ok: true });

    expect(calls.map((call) => `${String(call.init.method)} ${call.url}`)).toEqual([
      "GET /satchel-api/api/push/key",
      "POST /satchel-api/api/push/subscriptions",
      "DELETE /satchel-api/api/push/subscriptions",
    ]);
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({ endpoint, expirationTime: null, keys });
    expect(JSON.parse(String(calls[2]?.init.body))).toEqual({ endpoint });
    expect((calls[2]?.init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("reports push being off as a not_found ApiError", async () => {
    serve(() => apiError(404, "not_found", "Push notifications are off on this server."));
    await expect(getPushKey()).rejects.toMatchObject({ status: 404, code: "not_found" });
    await expect(getPushKey()).rejects.toBeInstanceOf(ApiError);
  });

  it("refuses to build a path without its id", () => {
    expect(() => urlFor("/api/conversations/:id/messages", {})).toThrow();
    expect(urlFor("/api/me")).toBe("/satchel-api/api/me");
  });
});

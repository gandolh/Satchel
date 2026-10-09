import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createClaudeToken,
  getMe,
  listConversations,
  listMessages,
  NetworkError,
  NoAccess,
  onAuthEvent,
  revokeClaudeToken,
  sendMessage,
  SignedOut,
  Unavailable,
  urlFor,
  type AuthEvent,
} from "./api";

const ME = { subject: "sub-1", displayName: "owner", inboxId: "inbox-1" };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function apiError(status: number, code: string, message = code): Response {
  return json(status, { error: { code, message } });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

let assign: ReturnType<typeof vi.fn>;
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
  assign = vi.fn();
  calls = [];
  events = [];
  stopListening = onAuthEvent((event) => events.push(event));
  vi.stubEnv("BASE_URL", "/satchel/");
  vi.stubGlobal("window", { location: { pathname: "/satchel/c/abc", search: "", assign } });
});

afterEach(() => {
  stopListening();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("renewal on 401", () => {
  it("shares one refresh between several concurrent 401s", async () => {
    let renewed = false;
    const refreshGate = deferred<void>();
    serve(async (url) => {
      if (url === "/ward-api/refresh") {
        await refreshGate.promise;
        renewed = true;
        return new Response(null, { status: 200 });
      }
      return renewed ? json(200, ME) : apiError(401, "unauthorized");
    });

    const pending = Promise.all([getMe(), getMe(), getMe()]);
    // Let all three 401s land before the refresh answers.
    await vi.waitFor(() => expect(callsTo("/ward-api/refresh")).toBe(1));
    await new Promise((r) => setTimeout(r, 10));
    refreshGate.resolve();

    await expect(pending).resolves.toEqual([ME, ME, ME]);
    expect(callsTo("/ward-api/refresh")).toBe(1);
    expect(callsTo("/satchel-api/api/me")).toBe(6);
    expect(assign).not.toHaveBeenCalled();
  });

  it("retries the request once after a refresh", async () => {
    let renewed = false;
    serve((url) => {
      if (url === "/ward-api/refresh") {
        renewed = true;
        return new Response(null, { status: 200 });
      }
      return renewed ? json(200, ME) : apiError(401, "unauthorized");
    });

    await expect(getMe()).resolves.toEqual(ME);
    expect(calls.map((call) => call.url)).toEqual([
      "/satchel-api/api/me",
      "/ward-api/refresh",
      "/satchel-api/api/me",
    ]);
    const refreshCall = calls[1];
    expect(refreshCall?.init.method).toBe("POST");
    expect(refreshCall?.init.credentials).toBe("same-origin");
  });

  it("does not refresh again for a 401 that raced a finished refresh", async () => {
    let renewed = false;
    const lateAnswer = deferred<Response>();
    let meCalls = 0;
    serve((url) => {
      if (url === "/ward-api/refresh") {
        renewed = true;
        return new Response(null, { status: 200 });
      }
      meCalls += 1;
      if (meCalls === 2) return lateAnswer.promise; // sent before the refresh, answered after it
      return renewed ? json(200, ME) : apiError(401, "unauthorized");
    });

    const first = getMe();
    const second = getMe();
    await expect(first).resolves.toEqual(ME);
    lateAnswer.resolve(apiError(401, "unauthorized"));
    await expect(second).resolves.toEqual(ME);
    expect(callsTo("/ward-api/refresh")).toBe(1);
  });

  it("goes to Ward's login with a bare next when the refresh fails", async () => {
    serve((url) =>
      url === "/ward-api/refresh" ? apiError(401, "invalid_refresh" as never) : apiError(401, "unauthorized"),
    );

    await expect(listConversations()).rejects.toBeInstanceOf(SignedOut);
    expect(assign).toHaveBeenCalledWith("/ward/login?next=%2Fsatchel%2Fc%2Fabc");
    expect(callsTo("/satchel-api/api/conversations")).toBe(1);
    expect(events).toEqual(["signed-out"]);
  });

  it("goes to login, without a second refresh, when the retry is a 401 too", async () => {
    serve((url) => (url === "/ward-api/refresh" ? new Response(null, { status: 200 }) : apiError(401, "unauthorized")));

    await expect(getMe()).rejects.toBeInstanceOf(SignedOut);
    expect(callsTo("/ward-api/refresh")).toBe(1);
    expect(callsTo("/satchel-api/api/me")).toBe(2);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("says Unavailable, and stays put, when Ward doesn't answer the refresh", async () => {
    serve((url) => (url === "/ward-api/refresh" ? new Response("Bad Gateway", { status: 502 }) : apiError(401, "unauthorized")));

    await expect(getMe()).rejects.toBeInstanceOf(Unavailable);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("errors", () => {
  it("raises NoAccess on a 403 and tells the auth gate", async () => {
    serve(() => apiError(403, "forbidden", "This Ward account has no access to Satchel."));
    const error = await getMe().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NoAccess);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as NoAccess).code).toBe("forbidden");
    expect(events).toEqual(["no-access"]);
    expect(assign).not.toHaveBeenCalled();
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

  it("refuses to build a path without its id", () => {
    expect(() => urlFor("/api/conversations/:id/messages", {})).toThrow();
    expect(urlFor("/api/me")).toBe("/satchel-api/api/me");
  });
});

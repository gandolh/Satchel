import type { ConversationSummary, Message } from "@satchel/shared";
import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "../errors";
import {
  buildTimeline,
  canSend,
  dayLabel,
  initialThreadState,
  isRetryable,
  textLength,
  threadReducer,
  type ThreadState,
} from "./model";

const CONVERSATION: ConversationSummary = {
  id: "c1",
  kind: "inbox",
  title: null,
  members: [],
  lastMessage: null,
  unreadCount: 0,
};

function message(seq: number, clientId: string, sentAt = "2026-10-09T08:00:00.000Z", sender = "me"): Message {
  return { seq, conversationId: "c1", sender, clientId, text: `text ${seq}`, sentAt };
}

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

function run(state: ThreadState, ...actions: Parameters<typeof threadReducer>[1][]): ThreadState {
  return actions.reduce(threadReducer, state);
}

describe("pending bubble reconciliation", () => {
  it("replaces the pending bubble with the stored message on a send answer", () => {
    const state = run(
      initialThreadState,
      { type: "sendStarted", clientId: A, text: "hello" },
      { type: "sendSucceeded", message: message(5, A) },
    );
    expect(state.pending).toEqual([]);
    expect(state.messages.map((m) => m.seq)).toEqual([5]);
  });

  it("drops the pending bubble when a poll returns its message first, then ignores the send answer", () => {
    const state = run(
      initialThreadState,
      { type: "sendStarted", clientId: A, text: "hello" },
      { type: "loaded", conversation: CONVERSATION, messages: [message(5, A)] },
      { type: "sendSucceeded", message: message(5, A) },
    );
    expect(state.pending).toEqual([]);
    expect(state.messages).toHaveLength(1);
  });

  it("keeps other pending bubbles", () => {
    const state = run(
      initialThreadState,
      { type: "sendStarted", clientId: A, text: "one" },
      { type: "sendStarted", clientId: B, text: "two" },
      { type: "sendSucceeded", message: message(5, A) },
    );
    expect(state.pending.map((p) => p.clientId)).toEqual([B]);
  });

  it("does not let a send answer move the polling cursor past an unpolled message", () => {
    const state = run(
      initialThreadState,
      { type: "loaded", conversation: CONVERSATION, messages: [message(3, "c3")] },
      { type: "sendStarted", clientId: A, text: "hello" },
      { type: "sendSucceeded", message: message(5, A) },
    );
    expect(state.cursor).toBe(3);
    const next = run(state, {
      type: "loaded",
      conversation: CONVERSATION,
      messages: [message(4, "c4", "2026-10-09T08:00:00.000Z", "claude"), message(5, A)],
    });
    expect(next.messages.map((m) => m.seq)).toEqual([3, 4, 5]);
    expect(next.cursor).toBe(5);
  });
});

describe("failed then retry", () => {
  it("marks a retryable failure failed and keeps the client ID and text through the retry", () => {
    let state = run(
      initialThreadState,
      { type: "sendStarted", clientId: A, text: "hello" },
      { type: "sendFailed", clientId: A, retryable: true, error: "x" },
    );
    expect(state.pending).toEqual([{ clientId: A, text: "hello", status: "failed" }]);
    state = run(state, { type: "retryStarted", clientId: A });
    expect(state.pending).toEqual([{ clientId: A, text: "hello", status: "sending" }]);
    state = run(state, { type: "sendSucceeded", message: message(7, A) });
    expect(state.pending).toEqual([]);
    expect(state.messages).toHaveLength(1);
  });

  it("marks a 400 or 409 rejected with the server's message", () => {
    const state = run(
      initialThreadState,
      { type: "sendStarted", clientId: A, text: "hello" },
      { type: "sendFailed", clientId: A, retryable: false, error: "Too long" },
    );
    expect(state.pending[0]).toEqual({ clientId: A, text: "hello", status: "rejected", error: "Too long" });
  });

  it("classifies errors", () => {
    expect(isRetryable(new NetworkError(new TypeError("offline")))).toBe(true);
    expect(isRetryable(new DOMException("timed out", "TimeoutError"))).toBe(true);
    expect(isRetryable(new ApiError(502, null, "bad gateway"))).toBe(true);
    expect(isRetryable(new ApiError(409, "client_id_conflict", "no"))).toBe(false);
    expect(isRetryable(new ApiError(400, "invalid_request", "no"))).toBe(false);
  });
});

describe("day separators", () => {
  const local = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).toISOString();

  it("starts a new day across midnight, not after 24 hours", () => {
    const now = new Date(2026, 9, 9, 12, 0);
    const items = buildTimeline(
      [
        message(1, A, local(7, 23, 59)),
        message(2, B, local(8, 0, 1)),
        message(3, "00000000-0000-4000-8000-00000000000c", local(8, 23, 0)),
      ],
      [],
      now,
    );
    expect(items.filter((i) => i.kind === "day").map((i) => (i.kind === "day" ? i.label : ""))).toEqual([
      "7 Oct",
      "Yesterday",
    ]);
  });

  it("puts pending bubbles under Today and labels the days", () => {
    const now = new Date(2026, 9, 9, 0, 5);
    const items = buildTimeline(
      [message(1, A, local(8, 23, 58))],
      [{ clientId: B, text: "late", status: "sending" }],
      now,
    );
    expect(items.map((i) => i.kind)).toEqual(["day", "message", "day", "pending"]);
    expect(dayLabel(new Date(2026, 9, 9, 8), now)).toBe("Today");
    expect(dayLabel(new Date(2025, 11, 31, 8), now)).toBe("31 Dec 2025");
  });
});

describe("composer rules", () => {
  it("counts a pasted CRLF as one character and blocks blank or too-long text", () => {
    expect(textLength("a\r\nb")).toBe(3);
    expect(canSend("   \n ")).toBe(false);
    expect(canSend("hi")).toBe(true);
    expect(canSend("x".repeat(4001))).toBe(false);
    expect(canSend("x".repeat(4000))).toBe(true);
  });
});

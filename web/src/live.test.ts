import { LIVE_CLOSE_SESSION_EXPIRED, type ConversationSummary, type LiveEvent, type Message } from "@satchel/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RECONNECT_MAX_MS,
  RECONNECT_MIN_MS,
  STALE_AFTER_AWAY_MS,
  createLiveClient,
  liveUrl,
  parseLiveFrame,
  reconnectDelay,
  shouldResync,
  type LiveClient,
  type LiveSocketLike,
} from "./live";
import { initialThreadState, threadReducer, type ThreadState } from "./thread/model";

/**
 * The live client's state machine, with a fake socket and fake timers. The
 * React hooks around it are thin (`useSyncExternalStore`, effects) and there
 * is no DOM in these tests, so the screens' wiring is checked through what the
 * hooks read: `connected()` is what turns their polling off and on.
 */

class FakeSocket implements LiveSocketLike {
  onopen: LiveSocketLike["onopen"] = null;
  onmessage: LiveSocketLike["onmessage"] = null;
  onclose: LiveSocketLike["onclose"] = null;
  onerror: LiveSocketLike["onerror"] = null;
  closedWith: number | undefined;

  constructor(readonly url: string) {}

  open(): void {
    this.onopen?.(new Event("open"));
  }
  send(event: unknown): void {
    this.onmessage?.({ data: typeof event === "string" ? event : JSON.stringify(event) } as MessageEvent);
  }
  /** The server (or the network) closed it. */
  drop(code = 1006): void {
    this.onclose?.({ code } as CloseEvent);
  }
  close(code?: number): void {
    this.closedWith = code;
  }
}

const at = "2026-10-09T08:00:00.000Z";
const CONVERSATION: ConversationSummary = {
  id: "c1",
  kind: "direct",
  title: null,
  members: [
    { id: "me", displayName: "Me", seenUpTo: 0, seenAt: null },
    { id: "friend", displayName: "Friend", seenUpTo: 0, seenAt: null },
  ],
  lastMessage: null,
  unreadCount: 0,
};

function message(seq: number, sender = "friend"): Message {
  return {
    seq,
    conversationId: "c1",
    sender,
    clientId: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    text: `message ${seq}`,
    sentAt: at,
  };
}

function messageEvent(seq: number): LiveEvent {
  return { type: "message", conversationId: "c1", message: message(seq) };
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let promise callbacks run without moving the fake clock. */
const settle = () => vi.advanceTimersByTimeAsync(0);

let sockets: FakeSocket[];
let renewSince: ReturnType<typeof vi.fn<(since: number) => Promise<boolean>>>;
let generation: number;
let hidden: boolean;
let wake: ((awayMs?: number) => void) | undefined;
let client: LiveClient;

function latest(): FakeSocket {
  const socket = sockets.at(-1);
  if (!socket) throw new Error("no socket was opened");
  return socket;
}

beforeEach(() => {
  vi.useFakeTimers();
  sockets = [];
  generation = 0;
  hidden = false;
  wake = undefined;
  renewSince = vi.fn<(since: number) => Promise<boolean>>(async () => true);
  client = createLiveClient({
    url: () => "ws://satchel.test/satchel-api/api/live",
    openSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    renewSince,
    renewalGeneration: () => generation,
    onWake: (callback) => {
      wake = callback;
      return () => {
        wake = undefined;
      };
    },
    isHidden: () => hidden,
    random: () => 0.5,
    now: Date.now,
  });
});

afterEach(() => {
  client.stop();
  vi.useRealTimers();
});

describe("catching up", () => {
  it("after a reconnect, missed messages are applied once, then the events that arrived meanwhile", async () => {
    // The server's messages, and a thread that catches up from its cursor.
    const server: Message[] = [message(1), message(2)];
    let state: ThreadState = initialThreadState;
    let gate: ReturnType<typeof deferred<void>> | null = null;
    client.onConnect(async () => {
      const cursor = state.cursor;
      if (gate) await gate.promise;
      state = threadReducer(state, {
        type: "loaded",
        conversation: CONVERSATION,
        messages: server.filter((m) => m.seq > cursor),
      });
    });
    client.onEvent((event) => {
      if (event.type === "message") state = threadReducer(state, { type: "received", message: event.message });
    });

    client.start();
    latest().open();
    await settle();
    expect(client.connected()).toBe(true);
    server.push(message(3));
    latest().send(messageEvent(3));
    expect(state.messages.map((m) => m.seq)).toEqual([1, 2, 3]);

    // The socket drops; 4 and 5 arrive while it's down.
    latest().drop();
    expect(client.connected()).toBe(false);
    server.push(message(4), message(5));
    await vi.advanceTimersByTimeAsync(RECONNECT_MIN_MS);
    expect(sockets).toHaveLength(2);

    // Open again. While the catch-up is in flight, 6 is stored and its event
    // arrives; it waits for the catch-up, whose answer has it too.
    gate = deferred();
    latest().open();
    await settle();
    expect(client.status()).toBe("syncing");
    server.push(message(6));
    latest().send(messageEvent(6));
    expect(state.messages.map((m) => m.seq)).toEqual([1, 2, 3]);
    gate.resolve();
    await settle();

    expect(client.connected()).toBe(true);
    expect(state.messages.map((m) => m.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(state.cursor).toBe(6);
  });

  it("a catch-up added while live runs at once (a thread opened while connected)", async () => {
    client.start();
    latest().open();
    await settle();
    const task = vi.fn();
    client.onConnect(task);
    expect(task).toHaveBeenCalledOnce();
  });

  it("a catch-up that fails drops the socket, keeps polling on, and tries again", async () => {
    let fail = true;
    client.onConnect(async () => {
      if (fail) throw new Error("offline");
    });
    client.start();
    latest().open();
    await settle();
    expect(client.connected()).toBe(false);
    expect(client.status()).toBe("waiting");
    expect(latest().closedWith).toBe(1000);

    fail = false;
    await vi.advanceTimersByTimeAsync(RECONNECT_MIN_MS);
    latest().open();
    await settle();
    expect(client.connected()).toBe(true);
  });

  it("ignores frames that aren't events", async () => {
    const events: LiveEvent[] = [];
    client.onEvent((event) => events.push(event));
    client.start();
    latest().open();
    await settle();
    latest().send("not json");
    latest().send({ type: "typing", conversationId: "c1" });
    latest().send({ type: "message", conversationId: "c1", message: { seq: 0 } });
    latest().send(messageEvent(1));
    expect(events).toEqual([messageEvent(1)]);
  });
});

describe("polling turns off while live and back on when the socket is down", () => {
  it("connected() flips with the socket, and subscribers hear each change", async () => {
    const polling: boolean[] = [];
    client.subscribe(() => polling.push(!client.connected()));
    expect(client.connected()).toBe(false);

    client.start();
    latest().open();
    await settle();
    expect(client.connected()).toBe(true);

    latest().drop();
    expect(client.connected()).toBe(false);
    await vi.advanceTimersByTimeAsync(RECONNECT_MIN_MS);
    latest().open();
    await settle();

    // A screen polls exactly while the last value is true.
    expect(polling.filter((value, i) => i === 0 || value !== polling[i - 1])).toEqual([true, false, true, false]);
    expect(polling.at(-1)).toBe(false);
  });
});

describe("reconnecting", () => {
  it("backs off from 1 to 30 seconds, and starts over once live", async () => {
    client.start();
    const delays: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const count = sockets.length;
      latest().drop();
      let waited = 0;
      while (sockets.length === count) {
        await vi.advanceTimersByTimeAsync(500);
        waited += 500;
      }
      delays.push(waited);
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);

    latest().open();
    await settle();
    latest().drop();
    await vi.advanceTimersByTimeAsync(RECONNECT_MIN_MS - 1);
    expect(sockets).toHaveLength(8);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(9);
  });

  it("the delay stays within 1 and 30 seconds whatever the jitter", () => {
    for (const random of [0, 0.5, 0.999]) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const delay = reconnectDelay(attempt, random);
        expect(delay).toBeGreaterThanOrEqual(RECONNECT_MIN_MS);
        expect(delay).toBeLessThanOrEqual(RECONNECT_MAX_MS);
      }
    }
  });

  it("on 4001 it renews the session first (unless renewed since the handshake), then reconnects", async () => {
    generation = 3;
    client.start();
    generation = 4;
    latest().open();
    await settle();
    await vi.advanceTimersByTimeAsync(15 * 60_000);

    latest().drop(LIVE_CLOSE_SESSION_EXPIRED);
    expect(renewSince).toHaveBeenCalledWith(3);
    expect(sockets).toHaveLength(1);
    await settle();
    expect(sockets).toHaveLength(2);
  });

  it("on 4001 with the session over, it stops and leaves the screens polling", async () => {
    renewSince.mockResolvedValue(false);
    client.start();
    latest().open();
    await settle();
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    latest().drop(LIVE_CLOSE_SESSION_EXPIRED);
    await settle();
    expect(client.status()).toBe("off");
    await vi.advanceTimersByTimeAsync(RECONNECT_MAX_MS * 2);
    expect(sockets).toHaveLength(1);
  });

  it("on 4001 with Ward down, it tries again with backoff", async () => {
    renewSince.mockRejectedValue(new Error("ward down"));
    client.start();
    latest().open();
    await settle();
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    latest().drop(LIVE_CLOSE_SESSION_EXPIRED);
    await settle();
    expect(client.status()).toBe("waiting");
    await vi.advanceTimersByTimeAsync(RECONNECT_MIN_MS);
    expect(sockets).toHaveLength(2);
  });

  it("waits while the page is hidden, and reconnects the moment it's shown", async () => {
    client.start();
    hidden = true;
    latest().drop();
    await vi.advanceTimersByTimeAsync(RECONNECT_MAX_MS * 2);
    expect(sockets).toHaveLength(1);

    hidden = false;
    wake?.();
    expect(sockets).toHaveLength(2);
  });

  it("replaces a live socket after a long time away, and catches up", async () => {
    let runs = 0;
    client.onConnect(() => {
      runs += 1;
    });
    client.start();
    latest().open();
    await settle();
    expect(client.status()).toBe("live");
    const first = latest();

    wake?.(STALE_AFTER_AWAY_MS + 1);
    expect(first.closedWith).toBe(1000);
    expect(sockets).toHaveLength(2);
    latest().open();
    await settle();
    expect(client.status()).toBe("live");
    expect(runs).toBe(2);
  });

  it("keeps a live socket across a quick tab switch", async () => {
    client.start();
    latest().open();
    await settle();
    wake?.(1000);
    wake?.();
    expect(sockets).toHaveLength(1);
    expect(client.status()).toBe("live");
  });

  it("stop closes the socket and stops reconnecting; start is idempotent", async () => {
    client.start();
    client.start();
    expect(sockets).toHaveLength(1);
    latest().open();
    await settle();
    client.stop();
    expect(latest().closedWith).toBe(1000);
    expect(client.status()).toBe("off");
    await vi.advanceTimersByTimeAsync(RECONNECT_MAX_MS * 2);
    expect(sockets).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("the socket is on the page's own origin, wss on https", () => {
    expect(liveUrl({ href: "https://gandolh.ro/satchel/c/1" })).toBe("wss://gandolh.ro/satchel-api/api/live");
    expect(liveUrl({ href: "http://localhost:5175/satchel/" })).toBe("ws://localhost:5175/satchel-api/api/live");
  });

  it("parseLiveFrame reads only events in the contract", () => {
    expect(parseLiveFrame(JSON.stringify(messageEvent(4)))).toEqual(messageEvent(4));
    expect(parseLiveFrame("{")).toBeNull();
    expect(parseLiveFrame(new ArrayBuffer(4))).toBeNull();
    expect(parseLiveFrame(JSON.stringify({ type: "seen", conversationId: "c1" }))).toBeNull();
  });
});

describe("shouldResync", () => {
  it("only for a live or syncing socket that was away past the threshold", () => {
    expect(shouldResync("live", STALE_AFTER_AWAY_MS + 1)).toBe(true);
    expect(shouldResync("syncing", STALE_AFTER_AWAY_MS + 1)).toBe(true);
    expect(shouldResync("live", STALE_AFTER_AWAY_MS)).toBe(false);
    expect(shouldResync("live", 0)).toBe(false);
    expect(shouldResync("waiting", 60_000)).toBe(false);
    expect(shouldResync("connecting", 60_000)).toBe(false);
    expect(shouldResync("off", 60_000)).toBe(false);
  });
});

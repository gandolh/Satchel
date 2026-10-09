import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { CLAUDE_MEMBER, LIVE_CLOSE_SESSION_EXPIRED, liveEventSchema, type LiveEvent, type Message } from "@satchel/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "../db/open.js";
import { createStore, type Store } from "../store.js";
import { SOCKET_OPEN, createHub, type Hub } from "./hub.js";
import { createLivePublisher } from "./publish.js";
import { LIVE_PING_MS, serveLiveSocket, type LiveConnection } from "./socket.js";

/** A socket that records what it was sent, and can be told to fail or close. */
class FakeSocket extends EventEmitter implements LiveConnection {
  readyState = SOCKET_OPEN;
  sent: LiveEvent[] = [];
  pings = 0;
  closedWith: number | undefined;
  terminated = false;
  failing = false;

  send(data: string): void {
    if (this.failing) throw new Error("socket broke");
    this.sent.push(liveEventSchema.parse(JSON.parse(data)));
  }
  ping(): void {
    this.pings += 1;
  }
  close(code?: number): void {
    this.closedWith = code;
    this.readyState = 3;
    this.emit("close");
  }
  terminate(): void {
    this.terminated = true;
    this.readyState = 3;
    this.emit("close");
  }
}

type Warn = (details: object, message: string) => void;

const at = "2026-10-09T08:00:00.000Z";
const message: Message = {
  seq: 7,
  conversationId: "c1",
  sender: "subject-a",
  clientId: randomUUID(),
  text: "hello",
  sentAt: at,
};
const event: LiveEvent = { type: "message", conversationId: "c1", message };

describe("the hub", () => {
  let hub: Hub;
  let warn: Warn;
  beforeEach(() => {
    warn = vi.fn<Warn>();
    hub = createHub({ warn });
  });

  it("sends to every open socket of the named subjects and nobody else", () => {
    const [a1, a2, b1, c1] = [new FakeSocket(), new FakeSocket(), new FakeSocket(), new FakeSocket()];
    hub.add("a", a1);
    hub.add("a", a2);
    hub.add("b", b1);
    hub.add("c", c1);

    expect(hub.publish(event, ["a", "b", "a"])).toEqual([]);
    expect(a1.sent).toEqual([event]);
    expect(a2.sent).toEqual([event]);
    expect(b1.sent).toEqual([event]);
    expect(c1.sent).toEqual([]);
  });

  it("never sends to Claude, and reports who had no open socket", () => {
    const a1 = new FakeSocket();
    hub.add("a", a1);
    const closing = new FakeSocket();
    closing.readyState = 2;
    hub.add("b", closing);

    expect(hub.publish(event, ["a", CLAUDE_MEMBER, "b", "d"])).toEqual(["b", "d"]);
    expect(closing.sent).toEqual([]);
  });

  it("one socket failing doesn't stop the others", () => {
    const [broken, fine] = [new FakeSocket(), new FakeSocket()];
    broken.failing = true;
    hub.add("a", broken);
    hub.add("a", fine);
    expect(hub.publish(event, ["a"])).toEqual([]);
    expect(fine.sent).toEqual([event]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("stops sending once a socket is removed", () => {
    const a1 = new FakeSocket();
    const remove = hub.add("a", a1);
    expect(hub.socketCount("a")).toBe(1);
    remove();
    remove();
    expect(hub.socketCount("a")).toBe(0);
    expect(hub.publish(event, ["a"])).toEqual(["a"]);
    expect(a1.sent).toEqual([]);
  });

  it("refuses an event outside the contract", () => {
    hub.add("a", new FakeSocket());
    const bad = { type: "message", conversationId: "c1", message: { ...message, seq: 0 } } as LiveEvent;
    expect(() => hub.publish(bad, ["a"])).toThrow();
  });
});

describe("one live socket", () => {
  let hub: Hub;
  let now: number;
  const clock = () => new Date(now);

  beforeEach(() => {
    vi.useFakeTimers();
    hub = createHub();
    now = Date.parse(at);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pings every 25 seconds and drops a socket that stopped answering", () => {
    const socket = new FakeSocket();
    serveLiveSocket(socket, { subject: "a", hub, expiresAt: now + 15 * 60_000, clock });

    vi.advanceTimersByTime(LIVE_PING_MS - 1);
    expect(socket.pings).toBe(0);
    vi.advanceTimersByTime(1);
    expect(socket.pings).toBe(1);
    socket.emit("pong");
    vi.advanceTimersByTime(LIVE_PING_MS);
    expect(socket.pings).toBe(2);
    expect(socket.terminated).toBe(false);

    // No pong for the second ping: the next tick drops it.
    vi.advanceTimersByTime(LIVE_PING_MS);
    expect(socket.terminated).toBe(true);
    expect(hub.socketCount("a")).toBe(0);
  });

  it("closes with 4001 at the token's exp, by the app's clock", () => {
    const socket = new FakeSocket();
    // Pings answered, so only the expiry can close it.
    socket.ping = () => socket.emit("pong");
    serveLiveSocket(socket, { subject: "a", hub, expiresAt: now + 60_000, clock });
    expect(hub.socketCount("a")).toBe(1);

    vi.advanceTimersByTime(59_999);
    expect(socket.closedWith).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(socket.closedWith).toBe(LIVE_CLOSE_SESSION_EXPIRED);
    expect(hub.socketCount("a")).toBe(0);
  });

  it("closes at once when the token has already expired", () => {
    const socket = new FakeSocket();
    serveLiveSocket(socket, { subject: "a", hub, expiresAt: now - 1000, clock });
    vi.advanceTimersByTime(0);
    expect(socket.closedWith).toBe(LIVE_CLOSE_SESSION_EXPIRED);
  });

  it("clears its timers when the client goes away", () => {
    const socket = new FakeSocket();
    serveLiveSocket(socket, { subject: "a", hub, expiresAt: now + 60_000, clock });
    socket.readyState = 3;
    socket.emit("close");
    expect(vi.getTimerCount()).toBe(0);
    expect(hub.socketCount("a")).toBe(0);
  });

  it("a ping that throws on a closing socket is logged, not thrown", () => {
    const socket = new FakeSocket();
    socket.ping = () => {
      throw new Error("WebSocket is not open");
    };
    const warn = vi.fn<Warn>();
    serveLiveSocket(socket, { subject: "a", hub, expiresAt: now + 60_000, clock, log: { warn } });
    expect(() => vi.advanceTimersByTime(LIVE_PING_MS)).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("the publisher", () => {
  let db: Db;
  let store: Store;
  let hub: Hub;
  let warn: Warn;
  let inbox: string;
  const sockets: Record<string, FakeSocket> = {};

  beforeEach(() => {
    db = openDb(":memory:");
    store = createStore(db, () => new Date(at));
    hub = createHub();
    warn = vi.fn<Warn>();
    for (const [subject, name] of [
      ["a", "ana"],
      ["b", "bob"],
      ["c", "cora"],
    ] as const) {
      store.upsertAccount(subject, name);
      sockets[subject] = new FakeSocket();
      hub.add(subject, sockets[subject]);
    }
    inbox = store.ensureInbox("a");
  });
  afterEach(() => {
    db.close();
  });

  const publisher = () => createLivePublisher({ hub, store, log: { warn } });
  const sent = (subject: string) => sockets[subject]!.sent;

  it("a message goes to the conversation's members; Claude's inbox only to its owner", () => {
    const { message } = store.appendMessage({ conversationId: inbox, sender: "a", clientId: randomUUID(), text: "idea" });
    publisher().messageStored(message);
    expect(sent("a")).toEqual([{ type: "message", conversationId: inbox, message }]);
    expect(sent("b")).toEqual([]);

    const { conversation } = store.createDirect("a", "b");
    const reply = store.appendMessage({ conversationId: conversation.id, sender: "b", clientId: randomUUID(), text: "hi" });
    publisher().messageStored(reply.message);
    expect(sent("a").at(-1)).toMatchObject({ type: "message", message: { seq: reply.message.seq } });
    expect(sent("b")).toHaveLength(1);
    expect(sent("c")).toEqual([]);
  });

  it("Claude's seen goes to the owner with Claude's marker and its time", () => {
    const { message } = store.appendMessage({ conversationId: inbox, sender: "a", clientId: randomUUID(), text: "idea" });
    store.markSeen(inbox, CLAUDE_MEMBER, message.seq);
    publisher().seenMoved(inbox, CLAUDE_MEMBER);
    expect(sent("a")).toEqual([
      { type: "seen", conversationId: inbox, member: CLAUDE_MEMBER, seenUpTo: message.seq, seenAt: at },
    ]);
  });

  it("a new conversation reaches each member with their own unread count", () => {
    const group = store.createGroup("a", "Hike", ["b", "c"]);
    store.appendMessage({ conversationId: group.id, sender: "a", clientId: randomUUID(), text: "who's in" });
    publisher().conversationCreated(group.id, "a");
    expect(sent("a")).toHaveLength(1);
    expect(sent("a")[0]).toMatchObject({ type: "conversation", conversation: { id: group.id, unreadCount: 0 } });
    expect(sent("b")[0]).toMatchObject({ type: "conversation", conversation: { id: group.id, unreadCount: 1 } });
    expect(sent("c")[0]).toMatchObject({ type: "conversation", conversation: { id: group.id, unreadCount: 1 } });
  });

  it("never throws: a broken hub or a bad lookup is logged and the request goes on", () => {
    const broken: Hub = {
      add: () => () => {},
      publish: () => {
        throw new Error("hub down");
      },
      socketCount: () => 0,
    };
    const live = createLivePublisher({ hub: broken, store, log: { warn } });
    const { message } = store.appendMessage({ conversationId: inbox, sender: "a", clientId: randomUUID(), text: "idea" });
    expect(() => live.messageStored(message)).not.toThrow();
    expect(() => live.seenMoved("no-such-conversation", "a")).not.toThrow();
    expect(() => live.conversationCreated(inbox, "a")).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(3);
  });
});

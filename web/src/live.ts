import { LIVE_CLOSE_SESSION_EXPIRED, LIVE_PATH, liveEventSchema, type LiveEvent } from "@satchel/shared";
import { useEffect, useEffectEvent, useSyncExternalStore } from "react";
import { API_BASE, onAuthEvent } from "./api";
import { renewalGeneration, renewSince } from "./ward";

export type { LiveEvent } from "@satchel/shared";

/**
 * Live updates (brief 12): one WebSocket per tab at `/satchel-api/api/live`,
 * which pushes new messages, seen markers and new conversations. Polling
 * stays as the fallback, and runs only while this socket isn't live.
 *
 * - **Connect** once something signed in asks for it (`useLiveConnection`),
 *   and stay connected until the session ends. Navigating doesn't close it.
 * - **Catch up on every (re)connect**: once the socket is open, every task
 *   registered with `onConnect` runs (the chat list refetches; an open
 *   thread fetches `after=<cursor>`). Events that arrive meanwhile wait, and
 *   are applied once all tasks succeeded; only then is the client `live`. A
 *   task that fails drops the socket, and the client tries again later.
 * - **Reconnect** with backoff from 1 to 30 seconds, at once when the page is
 *   shown again or the device comes back online, and not at all while the
 *   page is hidden.
 * - **4001** means the access token the socket opened with expired: renew
 *   the Ward session first (unless it was renewed since), then reconnect.
 *   Renewal refused means the session is over: the client stops, polling
 *   resumes, and the API client's 401 handling sends the browser to sign in.
 *
 * The browser can't see why a handshake failed. A refused one (say, a 401
 * after a laptop slept through the token's life) just retries with backoff;
 * meanwhile the fallback polling hits the same 401, which renews the cookie,
 * and the next attempt gets through.
 */

/** First reconnect delay. */
export const RECONNECT_MIN_MS = 1000;
/** Reconnect delays double up to this. */
export const RECONNECT_MAX_MS = 30_000;
/** A socket closed with 4001 sooner than this after opening reconnects with backoff, not at once. */
const SHORT_LIVED_MS = 60_000;

/**
 * - `off`: not started, or stopped because the session ended.
 * - `connecting`: the socket is opening.
 * - `syncing`: open, catch-up tasks running; events wait.
 * - `live`: in step with the server. Screens stop polling.
 * - `waiting`: closed; a reconnect is due (or the page is hidden).
 */
export type LiveStatus = "off" | "connecting" | "syncing" | "live" | "waiting";

/** What runs on every (re)connect before events flow. Reject (or throw) to say it failed and should be retried. */
export type CatchUp = () => unknown;

/** The part of a browser `WebSocket` the client uses. */
export interface LiveSocketLike {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  close(code?: number, reason?: string): void;
}

export interface LiveClientDeps {
  url(): string;
  openSocket(url: string): LiveSocketLike;
  /** `ward.ts`: renew unless a renewal happened since `since`. `true` renewed, `false` the session is over; throws when Ward is down. */
  renewSince(since: number): Promise<boolean>;
  renewalGeneration(): number;
  /** Calls back when the page is shown again or the device comes back online. Returns an unsubscribe function. */
  onWake(callback: () => void): () => void;
  isHidden(): boolean;
  /** For the backoff's jitter. */
  random(): number;
  now(): number;
}

export interface LiveClient {
  /** Connect, if not already started. */
  start(): void;
  /** Close the socket and stop reconnecting until `start` is called again. */
  stop(): void;
  status(): LiveStatus;
  /** Whether the socket is live and caught up: screens poll only while this is false. */
  connected(): boolean;
  /** Called whenever `status()` changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Every event, in the order the server sent them, after the catch-up. Returns an unsubscribe function. */
  onEvent(listener: (event: LiveEvent) => void): () => void;
  /**
   * Run `task` on every (re)connect. Added while the socket is open, it runs
   * at once as well (a thread opened while live loads that way). Returns the
   * function that removes it.
   */
  onConnect(task: CatchUp): () => void;
}

/** The part of a zod schema used here, so the shared schema fits without importing zod. */
interface EventSchema {
  safeParse(data: unknown): { success: true; data: LiveEvent } | { success: false };
}
const eventSchema: EventSchema = liveEventSchema;

/** One event out of a frame, or null for anything that isn't one (ignored). */
export function parseLiveFrame(data: unknown): LiveEvent | null {
  if (typeof data !== "string") return null;
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }
  const parsed = eventSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** The delay before reconnect attempt `attempt` (0-based): doubling from 1 s, ±20 % jitter, within 1 to 30 s. */
export function reconnectDelay(attempt: number, random: number): number {
  const base = RECONNECT_MIN_MS * 2 ** Math.min(attempt, 10);
  const jittered = base * (0.8 + 0.4 * random);
  return Math.round(Math.min(RECONNECT_MAX_MS, Math.max(RECONNECT_MIN_MS, jittered)));
}

export function createLiveClient(deps: LiveClientDeps): LiveClient {
  let status: LiveStatus = "off";
  let socket: LiveSocketLike | null = null;
  /** Failures since the client was last live: the backoff exponent. */
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let buffered: LiveEvent[] = [];
  let stopWaking: (() => void) | undefined;

  const statusListeners = new Set<() => void>();
  const eventListeners = new Set<(event: LiveEvent) => void>();
  const catchUps = new Set<CatchUp>();

  function setStatus(next: LiveStatus): void {
    if (status === next) return;
    status = next;
    for (const listener of statusListeners) listener();
  }

  function deliver(event: LiveEvent): void {
    for (const listener of eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("A live event handler failed", error);
      }
    }
  }

  async function run(task: CatchUp): Promise<void> {
    await task();
  }

  /** Close `ws` from this side (a catch-up failed) and try again later. */
  function drop(ws: LiveSocketLike): void {
    if (socket !== ws) return;
    socket = null;
    buffered = [];
    ws.close(1000, "catching up failed");
    scheduleReconnect();
  }

  function scheduleReconnect(): void {
    clearTimeout(timer);
    setStatus("waiting");
    const delay = reconnectDelay(attempt, deps.random());
    attempt += 1;
    timer = setTimeout(connect, delay);
  }

  async function sync(ws: LiveSocketLike): Promise<void> {
    setStatus("syncing");
    const results = await Promise.allSettled([...catchUps].map(run));
    if (socket !== ws) return;
    if (results.some((result) => result.status === "rejected")) {
      drop(ws);
      return;
    }
    attempt = 0;
    const waiting = buffered;
    buffered = [];
    for (const event of waiting) deliver(event);
    setStatus("live");
  }

  async function renewThenConnect(generation: number, livedMs: number): Promise<void> {
    setStatus("waiting");
    let renewed: boolean;
    try {
      renewed = await deps.renewSince(generation);
    } catch {
      // Ward isn't answering; try again later.
      if (status !== "off") scheduleReconnect();
      return;
    }
    if (status === "off") return;
    if (!renewed) {
      stop();
      return;
    }
    if (livedMs < SHORT_LIVED_MS) scheduleReconnect();
    else connect();
  }

  function connect(): void {
    clearTimeout(timer);
    timer = undefined;
    if (status === "off" || socket !== null) return;
    if (deps.isHidden()) {
      // Reconnects when the page is shown again (`onWake`).
      setStatus("waiting");
      return;
    }

    const generation = deps.renewalGeneration();
    let ws: LiveSocketLike;
    try {
      ws = deps.openSocket(deps.url());
    } catch {
      scheduleReconnect();
      return;
    }
    socket = ws;
    buffered = [];
    let openedAt: number | null = null;
    setStatus("connecting");

    ws.onopen = () => {
      if (socket !== ws) return;
      openedAt = deps.now();
      void sync(ws);
    };
    ws.onmessage = ({ data }) => {
      if (socket !== ws) return;
      const event = parseLiveFrame(data);
      if (event === null) return;
      if (status === "live") deliver(event);
      else buffered.push(event);
    };
    // A close always follows an error.
    ws.onerror = () => {};
    ws.onclose = ({ code }) => {
      if (socket !== ws) return;
      socket = null;
      buffered = [];
      if (status === "off") return;
      if (openedAt !== null && code === LIVE_CLOSE_SESSION_EXPIRED) {
        void renewThenConnect(generation, deps.now() - openedAt);
        return;
      }
      scheduleReconnect();
    };
  }

  function stop(): void {
    clearTimeout(timer);
    timer = undefined;
    stopWaking?.();
    stopWaking = undefined;
    buffered = [];
    setStatus("off");
    const ws = socket;
    socket = null;
    ws?.close(1000, "signed out");
  }

  return {
    start() {
      if (status !== "off") return;
      setStatus("waiting");
      stopWaking = deps.onWake(() => {
        if (status === "waiting") connect();
      });
      connect();
    },
    stop,
    status: () => status,
    connected: () => status === "live",
    subscribe(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
    onConnect(task) {
      catchUps.add(task);
      if (status === "syncing" || status === "live") {
        const ws = socket;
        run(task).catch(() => {
          if (ws !== null) drop(ws);
        });
      }
      return () => {
        catchUps.delete(task);
      };
    },
  };
}

// --- The tab's one client -------------------------------------------------------

/** `wss://` on the deploy's https origin, `ws://` in local dev; same origin either way. */
export function liveUrl(location: Pick<Location, "href"> = window.location): string {
  const url = new URL(`${API_BASE}${LIVE_PATH}`, location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export const live: LiveClient = createLiveClient({
  url: () => liveUrl(),
  openSocket: (url) => new WebSocket(url),
  renewSince,
  renewalGeneration,
  onWake(callback) {
    const onVisible = () => {
      if (document.visibilityState === "visible") callback();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", callback);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", callback);
    };
  },
  isHidden: () => document.visibilityState === "hidden",
  random: Math.random,
  now: Date.now,
});

// A 403 or a failed renewal anywhere ends the session, and the socket with it.
onAuthEvent(() => live.stop());

/** Whether the tab's socket is live right now, for code outside React. */
export function isLiveConnected(): boolean {
  return live.connected();
}

/** Open the tab's socket (once; later calls do nothing). Only inside the auth gate. It stays open across navigation. */
export function useLiveConnection(): void {
  useEffect(() => {
    live.start();
  }, []);
}

/** Whether the tab's socket is live and caught up; re-renders when that changes. Poll while it's false. */
export function useLiveConnected(): boolean {
  return useSyncExternalStore(live.subscribe, live.connected, () => false);
}

/** Calls `listener` with every live event while the component is mounted. Always the latest `listener`. */
export function useLiveEvents(listener: (event: LiveEvent) => void): void {
  const onEvent = useEffectEvent(listener);
  useEffect(() => live.onEvent((event) => onEvent(event)), []);
}

/**
 * Runs `task` on every (re)connect while mounted, and at once when mounted
 * (or `resetKey` changes) while the socket is open. Always the latest `task`.
 */
export function useLiveCatchUp(task: CatchUp, resetKey?: string | number): void {
  const runTask = useEffectEvent(task);
  useEffect(() => live.onConnect(() => runTask()), [resetKey]);
}

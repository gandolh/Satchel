import { LIVE_CLOSE_SESSION_EXPIRED } from "@satchel/shared";
import type { Clock } from "../clock.js";
import { SOCKET_OPEN, type Hub, type LiveSocket } from "./hub.js";

/** design: the server pings every 25 seconds, under the idle timeouts of proxies and phone networks. */
export const LIVE_PING_MS = 25_000;

/** The largest frame a client may send. Clients have nothing to say; this caps what a bad one can make the server read. */
export const LIVE_MAX_PAYLOAD_BYTES = 1024;

/** `setTimeout` can't wait longer than this; an access token never lives that long anyway. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** The part of a `ws` socket a live connection uses. */
export interface LiveConnection extends LiveSocket {
  ping(): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  on(event: "pong" | "close", listener: () => void): unknown;
}

export interface ServeLiveSocketOptions {
  subject: string;
  hub: Hub;
  /** When the access token the socket was opened with expires, in epoch milliseconds (`exp * 1000`). */
  expiresAt: number;
  clock: Clock;
  pingIntervalMs?: number;
  log?: { warn(details: object, message: string): void };
}

/**
 * One open `/api/live` socket, from upgrade to close:
 *
 * - tracked in the hub under the signed-in subject until it closes;
 * - pinged every 25 seconds, and dropped when the previous ping got no pong
 *   (the browser answers pings by itself);
 * - closed with 4001 at the access token's `exp`, so a socket never outlives
 *   the session it was opened with. The client renews and reconnects.
 *
 * Nothing a client sends is read.
 */
export function serveLiveSocket(socket: LiveConnection, options: ServeLiveSocketOptions): void {
  const { subject, hub, expiresAt, clock, pingIntervalMs = LIVE_PING_MS, log } = options;
  const untrack = hub.add(subject, socket);

  // A timer can fire while the socket is closing; ws throws on a ping then.
  const safely = (what: string, action: () => void) => {
    try {
      action();
    } catch (err) {
      log?.warn({ err, subject }, `live socket ${what} failed`);
    }
  };

  let answered = true;
  socket.on("pong", () => {
    answered = true;
  });
  const pinger = setInterval(() => {
    if (socket.readyState !== SOCKET_OPEN) return;
    if (!answered) {
      safely("terminate", () => socket.terminate());
      return;
    }
    answered = false;
    safely("ping", () => socket.ping());
  }, pingIntervalMs);

  const untilExpiry = Math.min(Math.max(0, expiresAt - clock().getTime()), MAX_TIMER_MS);
  const expiry = setTimeout(() => {
    safely("close", () => socket.close(LIVE_CLOSE_SESSION_EXPIRED, "session expired"));
  }, untilExpiry);

  socket.on("close", () => {
    clearInterval(pinger);
    clearTimeout(expiry);
    untrack();
  });
}

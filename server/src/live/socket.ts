import { LIVE_CLOSE_SESSION_EXPIRED } from "@satchel/shared";
import { SOCKET_OPEN, type Hub, type LiveSocket } from "./hub.js";

/** design: the server pings every 25 seconds, under the idle timeouts of proxies and phone networks. */
export const LIVE_PING_MS = 25_000;

/** The largest frame a client may send. Clients have nothing to say; this caps what a bad one can make the server read. */
export const LIVE_MAX_PAYLOAD_BYTES = 1024;

/**
 * How often an open socket asks the guard whether its session is still live.
 * The Ward check is cached for 30 seconds per session, so a Ward revoke ends
 * the socket between 30 and 40 seconds after it, never later.
 */
export const LIVE_RECHECK_MS = 10_000;

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
  /**
   * Whether the session the socket was opened with is still live, asked of the
   * same guard as every HTTP request. Rejecting counts as "no": the socket
   * fails closed.
   */
  stillSignedIn(): Promise<boolean>;
  pingIntervalMs?: number;
  recheckMs?: number;
  log?: { warn(details: object, message: string): void };
}

/**
 * One open `/api/live` socket, from upgrade to close:
 *
 * - tracked in the hub under the signed-in subject until it closes;
 * - pinged every 25 seconds, and dropped when the previous ping got no pong
 *   (the browser answers pings by itself);
 * - closed with 4001 as soon as `stillSignedIn()` says the session is over,
 *   checked every 10 seconds, so a socket never outlives the session it was
 *   opened with. The client reconnects, is refused while signed out, and falls
 *   back to polling, whose 401 sends the person to the login page.
 *
 * Nothing a client sends is read.
 */
export function serveLiveSocket(socket: LiveConnection, options: ServeLiveSocketOptions): void {
  const { subject, hub, stillSignedIn, pingIntervalMs = LIVE_PING_MS, recheckMs = LIVE_RECHECK_MS, log } = options;
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

  let checking = false;
  const rechecker = setInterval(() => {
    // One check at a time: a slow Ward must not stack them up.
    if (checking || socket.readyState !== SOCKET_OPEN) return;
    checking = true;
    stillSignedIn()
      .catch((err: unknown) => {
        log?.warn({ err, subject }, "live socket session check failed; closing");
        return false;
      })
      .then((live) => {
        if (!live) safely("close", () => socket.close(LIVE_CLOSE_SESSION_EXPIRED, "session ended"));
      })
      .finally(() => {
        checking = false;
      });
  }, recheckMs);

  socket.on("close", () => {
    clearInterval(pinger);
    clearInterval(rechecker);
    untrack();
  });
}

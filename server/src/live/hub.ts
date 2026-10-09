import { CLAUDE_MEMBER, LIVE_CLOSE_TOO_MANY_SOCKETS, liveEventSchema, type LiveEvent } from "@satchel/shared";

/**
 * Who has a live socket open, by Ward subject, and sending events to them
 * (brief 12). In-process only: Satchel runs as one container, so there is no
 * second process to fan out to.
 */

/** `WebSocket.OPEN` in `ws` and in browsers. */
export const SOCKET_OPEN = 1;

/**
 * The most sockets one subject may keep open: one per tab or installed app,
 * with room for a few devices. One more closes that subject's oldest.
 */
export const LIVE_SOCKETS_PER_SUBJECT = 10;

/** The part of a `ws` socket the hub uses, so tests can hand it a fake. */
export interface LiveSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/** Where a failed send is reported. Fastify's logger fits. */
export interface HubLog {
  warn(details: object, message: string): void;
}

export interface Hub {
  /**
   * Track `socket` as one of `subject`'s. Returns the function that stops
   * tracking it. When the subject already has `LIVE_SOCKETS_PER_SUBJECT`, the
   * oldest is dropped from the hub and closed with
   * `LIVE_CLOSE_TOO_MANY_SOCKETS`.
   */
  add(subject: string, socket: LiveSocket): () => void;
  /**
   * Send `event` to every open socket of every subject in `subjects`. Claude
   * is skipped (it has no sockets, and never gets an event); a subject named
   * twice gets it once. One socket failing doesn't stop the rest.
   *
   * Returns the subjects that had no open socket, in the order given: who
   * missed the event live (brief 14 pushes to those). Throws only for an event
   * that fails `liveEventSchema`, which is a bug in the caller.
   */
  publish(event: LiveEvent, subjects: readonly string[]): string[];
  /** Open sockets `subject` has right now. */
  socketCount(subject: string): number;
}

export function createHub(log?: HubLog): Hub {
  const sockets = new Map<string, Set<LiveSocket>>();

  return {
    add(subject, socket) {
      const mine = sockets.get(subject) ?? new Set<LiveSocket>();
      // A Set iterates in insertion order, so the first is the oldest. It
      // leaves the hub before it is told to close: its close event may come
      // later, and a second add in the meantime must not pick it again.
      while (mine.size >= LIVE_SOCKETS_PER_SUBJECT) {
        const oldest = mine.values().next().value;
        if (oldest === undefined) break;
        mine.delete(oldest);
        try {
          oldest.close(LIVE_CLOSE_TOO_MANY_SOCKETS, "too many open sockets");
        } catch (err) {
          log?.warn({ err, subject }, "closing the oldest live socket failed");
        }
      }
      mine.add(socket);
      // Set after the evictions: a close that fires its event at once may
      // have untracked the set's last socket and removed the entry.
      sockets.set(subject, mine);
      return () => {
        const current = sockets.get(subject);
        if (current === undefined) return;
        current.delete(socket);
        if (current.size === 0) sockets.delete(subject);
      };
    },

    publish(event, subjects) {
      // Validated (and stripped of anything extra) before it leaves, like every route's response.
      const data = JSON.stringify(liveEventSchema.parse(event));
      const missed: string[] = [];
      for (const subject of new Set(subjects)) {
        if (subject === CLAUDE_MEMBER) continue;
        let reached = false;
        for (const socket of sockets.get(subject) ?? []) {
          if (socket.readyState !== SOCKET_OPEN) continue;
          try {
            socket.send(data);
            reached = true;
          } catch (err) {
            log?.warn({ err, subject, type: event.type }, "live event not sent to one socket");
          }
        }
        if (!reached) missed.push(subject);
      }
      return missed;
    },

    socketCount(subject) {
      let open = 0;
      for (const socket of sockets.get(subject) ?? []) if (socket.readyState === SOCKET_OPEN) open += 1;
      return open;
    },
  };
}

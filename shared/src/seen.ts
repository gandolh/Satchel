import type { Member, Message } from "./model.js";

type SeenMessage = Pick<Message, "seq" | "sender">;
type SeenMarker = Pick<Member, "id" | "seenUpTo">;

export type TickState = "sent" | "seen";

/**
 * `seen`: "Seen 21:40" under message `seq`, in a conversation with one other
 * member. `seenBy`: "Seen by Maria, Andrei" under my last message, in a group.
 */
export type SeenLine =
  | { kind: "seen"; seq: number; seenAt: string | null }
  | { kind: "seenBy"; seq: number; names: string[] };

// Equal to min(max(current, requested), latestSeq) whenever current <= latestSeq,
// which always holds; written this way it stays forward-only even if it didn't.
export function nextSeenUpTo(current: number, requested: number, latestSeq: number): number {
  return Math.max(current, Math.min(requested, latestSeq));
}

export function isSeenBy(member: Pick<Member, "seenUpTo">, seq: number): boolean {
  return seq <= member.seenUpTo;
}

/** Seen once every member other than the sender (and me, the one looking) has it. */
export function tickState(message: SeenMessage, members: readonly SeenMarker[], me: string): TickState {
  const others = members.filter((member) => member.id !== message.sender && member.id !== me);
  return others.length > 0 && others.every((member) => isSeenBy(member, message.seq))
    ? "seen"
    : "sent";
}

export function seenLine(
  messages: readonly SeenMessage[],
  members: readonly Member[],
  me: string,
): SeenLine | null {
  const others = members.filter((member) => member.id !== me);
  const mine = messages.filter((message) => message.sender === me);

  const [only] = others;
  if (only !== undefined && others.length === 1) {
    const seq = newestSeq(mine.filter((message) => isSeenBy(only, message.seq)));
    return seq === 0 ? null : { kind: "seen", seq, seenAt: only.seenAt };
  }

  const lastSeq = newestSeq(mine);
  if (lastSeq === 0) return null;
  const names = others.filter((member) => isSeenBy(member, lastSeq)).map((member) => member.displayName);
  return names.length === 0 ? null : { kind: "seenBy", seq: lastSeq, names };
}

export function unreadCount(messages: readonly SeenMessage[], member: SeenMarker): number {
  return messages.filter((message) => message.sender !== member.id && !isSeenBy(member, message.seq))
    .length;
}

function newestSeq(messages: readonly SeenMessage[]): number {
  return messages.reduce((newest, message) => Math.max(newest, message.seq), 0);
}

/** `YYYY-MM-DD HH:MM` in the machine's local time zone. */
export function stamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** One block: `#seq  time[ (seen)]  first line`, continuation lines indented under the text. */
export function block(seq: number, sentAt: string, text: string, state?: string): string {
  const head = `#${seq}  ${stamp(sentAt)}${state ? ` (${state})` : ""}  `;
  const [first = "", ...rest] = text.split(/\r?\n/);
  const indent = " ".repeat(head.length);
  return [head + first, ...rest.map((line) => indent + line)].join("\n");
}

export function renderUnread(seenUpTo: number, messages: { seq: number; sentAt: string; text: string }[]): string {
  if (messages.length === 0) return `Ideas inbox · nothing unread · seen up to #${seenUpTo}`;
  const last = Math.max(...messages.map((m) => m.seq));
  return [
    `Ideas inbox · ${messages.length} unread · seen up to #${seenUpTo}`,
    "",
    messages.map((m) => block(m.seq, m.sentAt, m.text)).join("\n"),
    "",
    "Oldest first. Later messages can correct earlier ones. Gaps in numbers are normal.",
    `When you have read them all, run:  satchel seen ${last}`,
  ].join("\n");
}

/** Claude's own messages say so instead of seen or unread, which only mean something for the owner's. */
export const CLAUDE_REPLY_STATE = "Claude's reply";

export function renderHistory(
  messages: { seq: number; sentAt: string; text: string; seen: boolean; fromClaude: boolean }[],
): string {
  if (messages.length === 0) return "Ideas inbox · no messages match";
  const state = (m: { seen: boolean; fromClaude: boolean }) => (m.fromClaude ? CLAUDE_REPLY_STATE : m.seen ? "seen" : "unread");
  return [
    `Ideas inbox · ${messages.length} message${messages.length === 1 ? "" : "s"}`,
    "",
    messages.map((m) => block(m.seq, m.sentAt, m.text, state(m))).join("\n"),
  ].join("\n");
}

/** The text `satchel reply <n>` posts: messages have no reply field, so the number goes in front. */
export function replyText(n: number, text: string): string {
  return `Re #${n}: ${text}`;
}

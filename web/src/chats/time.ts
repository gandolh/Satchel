/**
 * Times as the chat list shows them, in the browser's time zone, 24-hour:
 * "21:40" today, "Yesterday", a weekday within the week, then a date.
 */

const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const dayMonthYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "21:40". */
export function clockTime(date: Date): string {
  return clock.format(date);
}

/** Local calendar days from `earlier` to `later`: 0 the same day, 1 yesterday. Safe across DST. */
export function calendarDaysBetween(earlier: Date, later: Date): number {
  const a = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  const b = new Date(later.getFullYear(), later.getMonth(), later.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** The time on a chat list row. */
export function listTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = calendarDaysBetween(date, now);
  if (days <= 0) return clockTime(date);
  if (days === 1) return "Yesterday";
  if (days < 7) return weekday.format(date);
  if (date.getFullYear() === now.getFullYear()) return dayMonth.format(date);
  return dayMonthYear.format(date);
}

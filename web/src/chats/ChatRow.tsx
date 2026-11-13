import type { ConversationSummary } from "@satchel/shared";
import { Avatar } from "../layout/Avatar";
import { Link } from "../layout/Link";
import { safeX } from "../layout/looks";
import { cn } from "../lib/cn";
import { Tick } from "../layout/Tick";
import { threadRoute } from "../router";
import { conversationSubtitle, conversationTitle, INBOX_SUBTITLE, lastMessagePreview } from "./conversation";
import { listTime } from "./time";

export interface ChatRowProps {
  conversation: ConversationSummary;
  /** My Ward subject. */
  me: string;
  /** The open conversation, beside the list on a wide screen. */
  selected: boolean;
}

/** The last message under a name: one line, cut with an ellipsis. */
const previewText = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";

/**
 * Avatar, name, time; then the last message and either an unread badge or, when mine, its tick. The open chat is the
 * strongest row (the control tone, a surface avatar, a bold name and a clay bar); the pinned Ideas inbox keeps its green
 * wash.
 */
export function ChatRow({ conversation, me, selected }: ChatRowProps) {
  const inbox = conversation.kind === "inbox";
  const title = conversationTitle(conversation, me);
  const preview = lastMessagePreview(conversation, me);
  const unread = conversation.unreadCount;
  const sentAt = conversation.lastMessage?.sentAt;

  return (
    <Link
      to={threadRoute(conversation.id)}
      className={cn(
        "group flex min-h-19 items-center gap-3 border-b border-line px-4 py-3 text-inherit no-underline focus-visible:-outline-offset-3",
        "motion-safe:transition-colors motion-safe:duration-120",
        safeX,
        inbox
          ? "bg-ok-soft hover:not-aria-[current=page]:bg-row-pinned-hover aria-[current=page]:bg-row-pinned-current aria-[current=page]:shadow-[inset_4px_0_0_var(--color-accent)]"
          : "bg-surface hover:not-aria-[current=page]:bg-row-hover aria-[current=page]:bg-control aria-[current=page]:shadow-[inset_4px_0_0_var(--color-accent)]",
      )}
      aria-current={selected ? "page" : undefined}
    >
      <Avatar name={title} claude={inbox} className={cn(!inbox && "group-aria-[current=page]:bg-surface")} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-none overflow-hidden text-input font-semibold text-ellipsis whitespace-nowrap group-aria-[current=page]:font-bold",
              inbox && "text-on-ok-soft",
            )}
          >
            {title}
          </span>
          {inbox && (
            <span className="min-w-0 flex-1 overflow-hidden text-small text-ellipsis whitespace-nowrap text-muted">
              {INBOX_SUBTITLE}
            </span>
          )}
          {sentAt && (
            <time
              className={cn(
                "ml-auto flex-none text-small tabular-nums",
                unread > 0 ? "font-semibold text-accent" : "text-muted",
              )}
              dateTime={sentAt}
            >
              {listTime(sentAt)}
            </time>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {preview ? (
            <span className="flex min-w-0 flex-1 items-center gap-1 text-compact text-ink-2">
              {preview.tick && <Tick state={preview.tick} />}
              <span className={previewText}>
                {preview.sender && `${preview.sender}: `}
                {preview.text}
              </span>
            </span>
          ) : (
            <span className={cn(previewText, "flex-1 text-compact text-ink-2 italic")}>
              {conversation.kind === "group" ? conversationSubtitle(conversation, me) : "No messages yet"}
            </span>
          )}
          {unread > 0 && (
            <span className="inline-grid h-6 min-w-6 flex-none place-items-center rounded-pill bg-accent px-2 text-small font-semibold text-accent-ink tabular-nums">
              <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
              <span className="sr-only">{unread === 1 ? "1 unread message" : `${unread} unread messages`}</span>
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

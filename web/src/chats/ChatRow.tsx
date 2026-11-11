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
const previewLine = "min-w-0 flex-1 overflow-hidden text-compact text-ellipsis whitespace-nowrap text-muted";

/** Avatar, name, time; then the last message and either an unread badge or, when mine, its tick. */
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
        "flex min-h-18 items-center gap-3 border-b border-line px-4 py-3 text-inherit no-underline focus-visible:-outline-offset-2",
        safeX,
        inbox
          ? "bg-accent-soft hover:not-aria-[current=page]:bg-row-pinned-hover aria-[current=page]:bg-row-pinned-current aria-[current=page]:shadow-[inset_3px_0_0_var(--color-accent)]"
          : "hover:not-aria-[current=page]:bg-row-hover aria-[current=page]:bg-sunk aria-[current=page]:shadow-[inset_3px_0_0_var(--color-accent)]",
      )}
      aria-current={selected ? "page" : undefined}
    >
      <Avatar name={title} claude={inbox} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 overflow-hidden font-title text-input font-semibold text-ellipsis whitespace-nowrap">
            {title}
            {inbox && <span className="font-body text-meta font-medium text-muted"> · {INBOX_SUBTITLE}</span>}
          </span>
          {sentAt && (
            <time
              className={cn(
                "flex-none text-small tabular-nums",
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
            <span className={previewLine}>
              {preview.tick && <Tick state={preview.tick} />}
              {preview.sender && `${preview.sender}: `}
              {preview.text}
            </span>
          ) : (
            <span className={cn(previewLine, "italic")}>
              {conversation.kind === "group" ? conversationSubtitle(conversation, me) : "No messages yet"}
            </span>
          )}
          {unread > 0 && (
            <span className="inline-grid h-5 min-w-5 flex-none place-items-center rounded-pill bg-accent px-1.5 text-small font-semibold text-accent-ink tabular-nums">
              <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
              <span className="sr-only">{unread === 1 ? "1 unread message" : `${unread} unread messages`}</span>
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

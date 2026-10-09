import type { ConversationSummary } from "@satchel/shared";
import { Avatar } from "../layout/Avatar";
import { Link } from "../layout/Link";
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

/** Avatar, name, time; then the last message and either an unread badge or, when mine, its tick. */
export function ChatRow({ conversation, me, selected }: ChatRowProps) {
  const inbox = conversation.kind === "inbox";
  const title = conversationTitle(conversation, me);
  const preview = lastMessagePreview(conversation, me);
  const unread = conversation.unreadCount;
  const sentAt = conversation.lastMessage?.sentAt;

  const className = ["chat-row", inbox ? "chat-row--pinned" : ""].filter(Boolean).join(" ");
  return (
    <Link to={threadRoute(conversation.id)} className={className} aria-current={selected ? "page" : undefined}>
      <Avatar name={title} claude={inbox} />
      <span className="chat-row__body">
        <span className="chat-row__top">
          <span className="chat-row__name">
            {title}
            {inbox && <span className="chat-row__tag"> · {INBOX_SUBTITLE}</span>}
          </span>
          {sentAt && (
            <time
              className={unread > 0 ? "chat-row__time chat-row__time--unread" : "chat-row__time"}
              dateTime={sentAt}
            >
              {listTime(sentAt)}
            </time>
          )}
        </span>
        <span className="chat-row__bottom">
          {preview ? (
            <span className="chat-row__preview">
              {preview.tick && <Tick state={preview.tick} />}
              {preview.sender && `${preview.sender}: `}
              {preview.text}
            </span>
          ) : (
            <span className="chat-row__preview chat-row__preview--empty">
              {conversation.kind === "group" ? conversationSubtitle(conversation, me) : "No messages yet"}
            </span>
          )}
          {unread > 0 && (
            <span className="badge">
              <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
              <span className="visually-hidden">{unread === 1 ? "1 unread message" : `${unread} unread messages`}</span>
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

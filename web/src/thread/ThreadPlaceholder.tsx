import { useEffect } from "react";
import { useMe } from "../auth/session";
import { conversationSubtitle, conversationTitle } from "../chats/conversation";
import { refreshConversations, useConversationSummary } from "../chats/conversations";
import { Avatar } from "../layout/Avatar";
import { ScreenHeader } from "../layout/ScreenHeader";

export interface ThreadScreenProps {
  /** The conversation id from `/satchel/c/:id`. */
  conversationId: string;
}

/**
 * What the shell mounts at `/satchel/c/:id`, keyed on the id. Brief 09
 * replaces this file's `ThreadScreen` with the real thread, keeping the name
 * and props, and the shell needs no change.
 */
export function ThreadScreen({ conversationId }: ThreadScreenProps) {
  const me = useMe();
  const conversation = useConversationSummary(conversationId);

  // On a phone deep link the list never loaded; fetch it once for the header.
  const known = conversation !== undefined;
  useEffect(() => {
    if (!known) void refreshConversations();
  }, [known]);

  const title = conversation ? conversationTitle(conversation, me.subject) : "Chat";
  const subtitle = conversation ? conversationSubtitle(conversation, me.subject) : "";
  return (
    <section className="screen">
      <ScreenHeader
        back
        title={title}
        subtitle={subtitle || undefined}
        leading={conversation && <Avatar name={title} claude={conversation.kind === "inbox"} size="sm" />}
      />
      <div className="screen__body empty-pane">
        <p>Messages will show here.</p>
      </div>
    </section>
  );
}

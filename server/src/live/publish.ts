import { CLAUDE_MEMBER, type ConversationSummary, type Message } from "@satchel/shared";
import type { Store } from "../store.js";
import type { Hub, HubLog } from "./hub.js";

/**
 * The publish points (brief 12). Routes call these after a store call
 * succeeded; each one works out who may see the event from the
 * conversation's own member list, so nothing reaches a non-member, and
 * Claude never gets one.
 *
 * None of them throws. A failed publish is logged and the request it came
 * from still succeeds: the clients catch up on their next reconnect or poll.
 */
export interface LivePublisher {
  /**
   * A message was stored: not a repeated client ID, which was published the
   * first time. Goes to every member, the sender's own sockets included. The
   * sender's seen marker moved to the message too (sending marks seen); there
   * is no separate `seen` event for that.
   */
  messageStored(message: Message): void;
  /** `member`'s seen marker moved forward in the conversation. `member` may be `CLAUDE_MEMBER`. */
  seenMoved(conversationId: string, member: string): void;
  /** A conversation was created (not an existing direct one handed back). Each member gets their own view. */
  conversationCreated(conversationId: string, creator: string): void;
}

export interface LivePublisherDeps {
  hub: Hub;
  store: Store;
  log: HubLog;
}

/** Everyone who gets events for the conversation: its members, minus Claude. */
function recipients(conversation: ConversationSummary): string[] {
  return conversation.members.map((member) => member.id).filter((id) => id !== CLAUDE_MEMBER);
}

export function createLivePublisher({ hub, store, log }: LivePublisherDeps): LivePublisher {
  function safely(what: string, details: object, publish: () => void): void {
    try {
      publish();
    } catch (err) {
      log.warn({ err, ...details }, `live ${what} event not published`);
    }
  }

  /** The conversation as `member` sees it. Throws when they aren't a member: the route checked, so that's a bug. */
  function conversationOf(conversationId: string, member: string): ConversationSummary {
    const conversation = store.getConversation(conversationId, member);
    if (conversation === null) throw new Error(`${member} is not a member of ${conversationId}`);
    return conversation;
  }

  return {
    messageStored(message) {
      const { conversationId } = message;
      safely("message", { conversationId }, () => {
        const conversation = conversationOf(conversationId, message.sender);
        hub.publish({ type: "message", conversationId, message }, recipients(conversation));
      });
    },

    seenMoved(conversationId, member) {
      safely("seen", { conversationId }, () => {
        const conversation = conversationOf(conversationId, member);
        const marker = conversation.members.find((m) => m.id === member);
        if (marker === undefined || marker.seenAt === null) throw new Error(`no seen marker for ${member}`);
        hub.publish(
          { type: "seen", conversationId, member, seenUpTo: marker.seenUpTo, seenAt: marker.seenAt },
          recipients(conversation),
        );
      });
    },

    conversationCreated(conversationId, creator) {
      safely("conversation", { conversationId }, () => {
        for (const member of recipients(conversationOf(conversationId, creator))) {
          // unreadCount and lastMessage are per viewer, so each member's summary is their own.
          hub.publish({ type: "conversation", conversation: conversationOf(conversationId, member) }, [member]);
        }
      });
    },
  };
}

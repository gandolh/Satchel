import { useState } from "react";
import { NetworkError, Unavailable } from "../api";
import { useMe } from "../auth/session";
import { ScreenHeader } from "../layout/ScreenHeader";
import { usePolling } from "../polling";
import { CHAT_LIST_POLL_MS, refreshConversations, useConversations, useLiveChats } from "./conversations";
import { ChatRow } from "./ChatRow";

/** Why the list couldn't refresh, in plain words. */
function describe(error: Error): string {
  if (error instanceof Unavailable) return "Satchel can’t reach sign-in right now.";
  if (error instanceof NetworkError) return "You’re offline, or Satchel can’t be reached.";
  return "Satchel couldn’t load your chats.";
}

/**
 * The chat list. Live events keep it current while the tab's socket is up;
 * while it's down, `GET /api/conversations` every 10 seconds while the page
 * is visible, and at once when it becomes visible again. The Ideas inbox
 * comes first; the server sends it first and the store keeps it there.
 */
export function ChatList({ selectedId }: { selectedId?: string }) {
  const me = useMe();
  const { conversations, error } = useConversations();
  const connected = useLiveChats();
  usePolling(refreshConversations, { intervalMs: CHAT_LIST_POLL_MS, enabled: !connected });

  return (
    <section className="screen">
      <ScreenHeader title="Chats" level={1} large />
      <div className="screen__body">
        {conversations === null ? (
          error ? (
            <ListError message={describe(error)} />
          ) : (
            <ListLoading />
          )
        ) : (
          <>
            {error && (
              <p className="list-banner" role="status">
                {describe(error)} Trying again.
              </p>
            )}
            {conversations.length === 0 ? (
              <p className="list-note">No chats yet.</p>
            ) : (
              <ul className="chat-list">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <ChatRow conversation={conversation} me={me.subject} selected={conversation.id === selectedId} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function ListLoading() {
  return (
    <div aria-busy="true" aria-label="Loading chats">
      {[0, 1, 2].map((row) => (
        <div className="skeleton-row" key={row} aria-hidden="true">
          <span className="avatar" />
          <span className="skeleton-lines">
            <span className="skeleton-line" style={{ width: row === 0 ? "40%" : "55%" }} />
            <span className="skeleton-line" style={{ width: "75%" }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function ListError({ message }: { message: string }) {
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="list-note" role="alert">
      <p>{message}</p>
      <button
        type="button"
        className="button button--quiet"
        disabled={retrying}
        onClick={() => {
          setRetrying(true);
          void refreshConversations().finally(() => setRetrying(false));
        }}
      >
        {retrying ? "Trying…" : "Try again"}
      </button>
    </div>
  );
}

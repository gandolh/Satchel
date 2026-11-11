import { useState } from "react";
import { NetworkError, Unavailable } from "../api";
import { useMe } from "../auth/session";
import { Link } from "../layout/Link";
import { ScreenHeader } from "../layout/ScreenHeader";
import { usePolling } from "../polling";
import { NEW_CHAT } from "../router";
import { CHAT_LIST_POLL_MS, refreshConversations, useConversations, useLiveChats } from "./conversations";
import { ChatRow } from "./ChatRow";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/cn";
import { iconButton, listNote, screen, screenBody } from "../layout/looks";

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
    <section className={screen}>
      <ScreenHeader
        title="Chats"
        level={1}
        large
        actions={
          <Link to={NEW_CHAT} className={cn(iconButton, "-mr-2 ml-auto")} aria-label="New chat">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M12 20h8M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
            </svg>
          </Link>
        }
      />
      <div className={screenBody}>
        {conversations === null ? (
          error ? (
            <ListError message={describe(error)} />
          ) : (
            <ListLoading />
          )
        ) : (
          <>
            {error && (
              <p className="border-b border-line bg-sunk px-4 py-2 text-meta text-muted" role="status">
                {describe(error)} Trying again.
              </p>
            )}
            {conversations.length === 0 ? (
              <p className={listNote}>No chats yet. Start one with the pencil above.</p>
            ) : (
              <ul className="bg-surface">
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
        <div className="flex min-h-18 items-center gap-3 border-b border-line px-4 py-3" key={row} aria-hidden="true">
          <span className="size-12 flex-none rounded-pill bg-sunk" />
          <span className="grid flex-1 gap-2">
            <span className={cn("h-2.5 rounded-pill bg-sunk", row === 0 ? "w-2/5" : "w-[55%]")} />
            <span className="h-2.5 w-3/4 rounded-pill bg-sunk" />
          </span>
        </div>
      ))}
    </div>
  );
}

function ListError({ message }: { message: string }) {
  const [retrying, setRetrying] = useState(false);
  return (
    <div className={listNote} role="alert">
      <p>{message}</p>
      <Button
        variant="quiet"
        disabled={retrying}
        onClick={() => {
          setRetrying(true);
          void refreshConversations().finally(() => setRetrying(false));
        }}
      >
        {retrying ? "Trying…" : "Try again"}
      </Button>
    </div>
  );
}

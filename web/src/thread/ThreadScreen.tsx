import { CLAUDE_MEMBER, seenLine, tickState, type Message } from "@satchel/shared";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { listMessages, markSeen, sendMessage, SignedOut, NoAccess, ApiError } from "../api";
import { useMe } from "../auth/session";
import { conversationSubtitle, conversationTitle, withNewerMarkers } from "../chats/conversation";
import { refreshConversations, useConversationSummary, useLiveChats } from "../chats/conversations";
import { clockTime } from "../chats/time";
import { Avatar } from "../layout/Avatar";
import { ScreenHeader } from "../layout/ScreenHeader";
import { Tick } from "../layout/Tick";
import { isLiveConnected, useLiveCatchUp, useLiveEvents } from "../live";
import { usePageVisible, usePolling } from "../polling";
import { Composer } from "./Composer";
import { buildTimeline, initialThreadState, isRetryable, threadReducer, type PendingMessage } from "./model";
import "./thread.css";

export interface ThreadScreenProps {
  /** The conversation id from `/satchel/c/:id`. */
  conversationId: string;
}

/** design.md and the brief: new messages are fetched every 3 seconds while visible, now only while live updates are down. */
export const THREAD_POLL_MS = 3000;
const SEND_TIMEOUT_MS = 10_000;
const PAGE = 200;
/** Stop paging one enormous fetch; the next one carries on from the cursor. */
const MAX_PAGES = 10;

/**
 * Live events (brief 12) dispatch `received` and `seenMoved`; every
 * (re)connect fetches `after=<cursor>`; `usePolling` runs only while the
 * tab's socket is down. All state is the reducer in model.ts.
 */
export function ThreadScreen({ conversationId }: ThreadScreenProps) {
  const me = useMe();
  const visible = usePageVisible();
  const connected = useLiveChats();
  const [state, dispatch] = useReducer(threadReducer, initialThreadState);
  const summary = useConversationSummary(conversationId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  // The thread's own answer, with any marker the (live-updated) list has seen move since.
  const conversation = useMemo(
    () => (state.conversation && summary ? withNewerMarkers(state.conversation, summary) : (state.conversation ?? summary)),
    [state.conversation, summary],
  );
  const title = conversation ? conversationTitle(conversation, me.subject) : "Chat";
  const subtitle = conversation ? conversationSubtitle(conversation, me.subject) : "";
  const members = conversation?.members ?? [];
  const isInbox = conversation?.kind === "inbox";
  const isGroup = conversation?.kind === "group";

  // --- Loading: live events, catch-up, and polling while down -----------------

  /** Everything after the cursor as it is now, page by page until a short page. Throws on failure. */
  const fetchNew = async () => {
    let cursor = state.cursor;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const response = await listMessages(
        conversationId,
        { after: cursor, limit: PAGE },
        { signal: AbortSignal.timeout(SEND_TIMEOUT_MS) },
      );
      dispatch({ type: "loaded", conversation: response.conversation, messages: response.messages });
      cursor = response.messages.at(-1)?.seq ?? cursor;
      if (response.messages.length < PAGE) break;
    }
    setOffline(false);
    setLoadError(null);
  };
  const showLoadFailure = (error: unknown) => {
    if (error instanceof SignedOut || error instanceof NoAccess) return;
    if (state.loaded) setOffline(true);
    else setLoadError(error instanceof ApiError ? error.message : "Couldn't load this chat. Retrying.");
  };

  const poll = () => fetchNew().catch(showLoadFailure);
  usePolling(poll, { intervalMs: THREAD_POLL_MS, resetKey: conversationId, enabled: !connected });

  // On every (re)connect, and on opening a chat while live. A failure that
  // retrying can fix drops the socket, so polling covers until it's back; a
  // 404 or the session ending just shows, like a failed poll.
  useLiveCatchUp(async () => {
    try {
      await fetchNew();
    } catch (error) {
      showLoadFailure(error);
      if (isRetryable(error)) throw error;
    }
  }, conversationId);

  useLiveEvents((event) => {
    if (event.type === "message" && event.conversationId === conversationId) {
      dispatch({ type: "received", message: event.message });
    } else if (event.type === "seen" && event.conversationId === conversationId) {
      dispatch({ type: "seenMoved", member: event.member, seenUpTo: event.seenUpTo, seenAt: event.seenAt });
    }
  });

  // --- Own seen marker ---------------------------------------------------------

  const mine = members.find((member) => member.id === me.subject);
  const newestFromOthers = useMemo(
    () => state.messages.reduce((top, m) => (m.sender === me.subject ? top : Math.max(top, m.seq)), 0),
    [state.messages, me.subject],
  );
  const marked = useRef(0);
  const seenBase = mine?.seenUpTo ?? 0;
  // Bumped after a failed seen call so the effect below runs again.
  const [seenRetry, setSeenRetry] = useState(0);
  const seenTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(seenTimer.current), []);
  useEffect(() => {
    if (!visible || !state.loaded) return;
    if (newestFromOthers <= Math.max(seenBase, marked.current)) return;
    const upTo = newestFromOthers;
    marked.current = upTo;
    markSeen(conversationId, { upTo }, { signal: AbortSignal.timeout(SEND_TIMEOUT_MS) }).then(
      // While live, the `seen` event updates the list.
      () => void (isLiveConnected() || refreshConversations()),
      () => {
        // The marker only moves forward. Retry no faster than the poll interval.
        marked.current = Math.min(marked.current, upTo - 1);
        clearTimeout(seenTimer.current);
        seenTimer.current = setTimeout(() => setSeenRetry((n) => n + 1), THREAD_POLL_MS);
      },
    );
  }, [visible, state.loaded, newestFromOthers, seenBase, conversationId, seenRetry]);

  // --- Sending -----------------------------------------------------------------

  const post = useCallback(
    async (clientId: string, text: string) => {
      try {
        const { message } = await sendMessage(
          conversationId,
          { clientId, text },
          { signal: AbortSignal.timeout(SEND_TIMEOUT_MS) },
        );
        dispatch({ type: "sendSucceeded", message });
        // While live, the `message` event updates the list.
        if (!isLiveConnected()) void refreshConversations();
      } catch (error) {
        if (error instanceof SignedOut) return;
        dispatch({
          type: "sendFailed",
          clientId,
          retryable: isRetryable(error),
          error: error instanceof Error ? error.message : "Couldn't send this message.",
        });
      }
    },
    [conversationId],
  );

  const forceBottom = useRef(false);
  const send = (text: string) => {
    const clientId = crypto.randomUUID();
    forceBottom.current = true;
    dispatch({ type: "sendStarted", clientId, text });
    void post(clientId, text);
  };
  const retry = (bubble: PendingMessage) => {
    forceBottom.current = true;
    dispatch({ type: "retryStarted", clientId: bubble.clientId });
    void post(bubble.clientId, bubble.text);
  };

  // --- Scrolling ---------------------------------------------------------------

  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastKey = useRef<string | null>(null);
  const [newBelow, setNewBelow] = useState(false);

  const now = new Date();
  const timeline = buildTimeline(state.messages, state.pending, now);
  const tailKey = timeline.at(-1)?.key ?? null;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !state.loaded) return;
    const first = lastKey.current === null;
    const changed = tailKey !== lastKey.current;
    lastKey.current = tailKey;
    if (!changed) return;
    if (first || forceBottom.current || atBottom.current) {
      el.scrollTop = el.scrollHeight;
      forceBottom.current = false;
      setNewBelow(false);
    } else {
      setNewBelow(true);
    }
  }, [tailKey, state.loaded]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (atBottom.current) setNewBelow(false);
  };
  const jumpToBottom = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  // --- Render ------------------------------------------------------------------

  const line = seenLine(state.messages, members, me.subject);
  const senderName = (message: Message) => members.find((member) => member.id === message.sender)?.displayName ?? "";
  const otherMember = members.find((member) => member.id !== me.subject);

  return (
    <section className="screen thread">
      <ScreenHeader
        back
        title={title}
        subtitle={subtitle || undefined}
        leading={conversation && <Avatar name={title} claude={isInbox} size="sm" />}
      />
      <div className="thread__scroll" ref={scroller} onScroll={onScroll}>
        {!state.loaded ? (
          <p className="thread__status" role={loadError ? "alert" : "status"}>
            {loadError ?? "Loading messages…"}
          </p>
        ) : (
          <ol className="thread__list" aria-label="Messages">
            {conversation && conversation.kind !== "inbox" && (
              <li className="thread__notice">
                <span className="thread__pill">Claude has no access to this chat</span>
              </li>
            )}
            {state.messages.length === 0 && state.pending.length === 0 && (
              <li className="thread__empty">
                {isInbox ? "Write down an idea. Claude reads it next time you ask." : "No messages yet."}
              </li>
            )}
            {timeline.map((item) => {
              if (item.kind === "day") {
                return (
                  <li key={item.key} className="thread__day">
                    <span>{item.label}</span>
                  </li>
                );
              }
              if (item.kind === "pending") {
                return <PendingBubble key={item.key} bubble={item.pending} onRetry={retry} />;
              }
              const { message } = item;
              const own = message.sender === me.subject;
              const claude = message.sender === CLAUDE_MEMBER;
              return (
                <li key={item.key} className={own ? "row row--mine" : "row"}>
                  <div className={own ? "bubble bubble--mine" : "bubble"}>
                    {isGroup && !own && <span className="bubble__sender">{senderName(message)}</span>}
                    <p className="bubble__text">{message.text}</p>
                    <span className="bubble__meta">
                      {clockTime(new Date(message.sentAt))}
                      {own && <Tick state={tickState(message, members, me.subject)} />}
                    </span>
                  </div>
                  {line?.seq === message.seq && (
                    <SeenLine line={line} avatarName={otherMember?.displayName ?? title} claude={claude || isInbox} />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {offline && (
        <p className="thread__offline" role="status">
          Can't reach Satchel. Trying again.
        </p>
      )}
      {newBelow && (
        <button type="button" className="thread__new button" onClick={jumpToBottom}>
          New messages
        </button>
      )}
      <Composer onSend={send} />
    </section>
  );
}

function PendingBubble({ bubble, onRetry }: { bubble: PendingMessage; onRetry: (bubble: PendingMessage) => void }) {
  if (bubble.status === "sending") {
    return (
      <li className="row row--mine">
        <div className="bubble bubble--mine bubble--sending">
          <p className="bubble__text">{bubble.text}</p>
          <span className="bubble__meta">Sending…</span>
        </div>
      </li>
    );
  }
  const failed = bubble.status === "failed";
  const content = (
    <>
      <p className="bubble__text">{bubble.text}</p>
    </>
  );
  return (
    <li className="row row--mine">
      {failed ? (
        <button type="button" className="bubble bubble--failed" onClick={() => onRetry(bubble)}>
          {content}
        </button>
      ) : (
        <div className="bubble bubble--failed">{content}</div>
      )}
      <p className="row__error" role="alert">
        {failed ? "Not sent. Tap to retry" : (bubble.error ?? "Not sent.")}
      </p>
    </li>
  );
}

function SeenLine({
  line,
  avatarName,
  claude,
}: {
  line: NonNullable<ReturnType<typeof seenLine>>;
  avatarName: string;
  claude: boolean;
}) {
  if (line.kind === "seenBy") return <p className="row__seen">Seen by {line.names.join(", ")}</p>;
  return (
    <p className="row__seen">
      <Avatar name={avatarName} claude={claude} size="xs" />
      {line.seenAt ? `Seen ${clockTime(new Date(line.seenAt))}` : "Seen"}
    </p>
  );
}

import { useEffect } from "react";
import { ChatList } from "../chats/ChatList";
import { useMediaQuery, WIDE_QUERY } from "../polling";
import { navigate, pathFor, usePathname, useRoute } from "../router";
import { Settings } from "../settings/Settings";
import { ThreadScreen } from "../thread/ThreadPlaceholder";
import { TabBar } from "./TabBar";

/**
 * The signed-in app. Phone: one view at a time, the tab bar under Chats and
 * Settings, a back arrow in the thread. From 900px: the chat list (with the
 * tab bar) in a 320px column and the thread or Settings beside it.
 */
export function AppShell() {
  const route = useRoute();
  const pathname = usePathname();
  const wide = useMediaQuery(WIDE_QUERY);

  // Unknown paths are chats; trailing slashes and the bare base are tidied too.
  useEffect(() => {
    if (pathname !== pathFor(route)) navigate(route, { replace: true });
  }, [pathname, route]);

  const pane =
    route.name === "thread" ? (
      <ThreadScreen key={route.id} conversationId={route.id} />
    ) : route.name === "settings" ? (
      <Settings />
    ) : null;
  const tab = route.name === "settings" ? "settings" : "chats";

  if (wide) {
    return (
      <div className="shell shell--wide">
        <div className="shell__side">
          <ChatList selectedId={route.name === "thread" ? route.id : undefined} />
          <TabBar active={tab} />
        </div>
        <main className="shell__main">{pane ?? <EmptyPane />}</main>
      </div>
    );
  }

  return (
    <div className="shell">
      <main className="shell__main">{pane ?? <ChatList />}</main>
      {route.name !== "thread" && <TabBar active={tab} />}
    </div>
  );
}

function EmptyPane() {
  return (
    <div className="empty-pane">
      <span className="mark" aria-hidden="true">
        S
      </span>
      <p>Pick a chat to read it here.</p>
    </div>
  );
}

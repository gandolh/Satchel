import { useEffect } from "react";
import { ChatList } from "../chats/ChatList";
import { NewChat } from "../people/NewChat";
import { useMediaQuery, WIDE_QUERY } from "../polling";
import { navigate, pathFor, usePathname, useRoute } from "../router";
import { Settings } from "../settings/Settings";
import { ShareScreen } from "../share/ShareScreen";
import { ThreadScreen } from "../thread/ThreadPlaceholder";
import { Mark } from "./Mark";
import { Rail } from "./Rail";
import { TabBar } from "./TabBar";

/**
 * The signed-in app. Phone: one view at a time, the tab bar under Chats and
 * Settings, a back arrow in the thread. From 900px: a 72px side rail (Chats,
 * Settings), the chat list in a 340px column and the thread, Settings or New
 * chat beside it.
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
    ) : route.name === "new" ? (
      <NewChat />
    ) : route.name === "share" ? (
      <ShareScreen />
    ) : null;
  const tab = route.name === "settings" ? "settings" : "chats";

  if (wide) {
    return (
      <div className="grid h-dvh min-h-0 grid-cols-[72px_var(--width-list)_minmax(0,1fr)] overflow-hidden">
        <Rail active={tab} />
        <div className="flex min-h-0 flex-col border-r border-line bg-surface">
          <ChatList selectedId={route.name === "thread" ? route.id : undefined} />
        </div>
        <main className={main}>{pane ?? <EmptyPane />}</main>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <main className={main}>{pane ?? <ChatList />}</main>
      {route.name !== "thread" && <TabBar active={tab} />}
    </div>
  );
}

/** The shell's main column: one screen at a time, which scrolls inside itself. */
const main = "flex min-h-0 min-w-0 flex-1 flex-col";

function EmptyPane() {
  return (
    <div className="grid flex-1 place-content-center justify-items-center gap-3 p-8 text-center text-ink-2">
      <Mark />
      <p className="text-compact">Pick a chat to read it here.</p>
    </div>
  );
}

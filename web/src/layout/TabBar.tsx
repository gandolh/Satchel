import { cn } from "../lib/cn";
import { CHATS, SETTINGS } from "../router";
import { ChatsIcon, SettingsIcon } from "./icons";
import { Link } from "./Link";

/** One tab: an icon over a label, in the accent when it is the current page. */
const item = cn(
  "grid min-w-22 justify-items-center gap-0.5 rounded-md px-3 pt-2 pb-1 text-small font-medium text-muted no-underline [&_svg]:size-6",
  "hover:text-ink aria-[current=page]:text-accent aria-[current=page]:hover:text-accent",
);

/** Chats and Settings, at the bottom of the list column (and of the phone screen). */
export function TabBar({ active }: { active: "chats" | "settings" }) {
  return (
    <nav
      className="flex flex-none justify-around border-t border-line bg-surface pt-1 pb-[max(--spacing(2),env(safe-area-inset-bottom,0px))]"
      aria-label="Main"
    >
      <Link to={CHATS} className={item} aria-current={active === "chats" ? "page" : undefined}>
        <ChatsIcon />
        <span>Chats</span>
      </Link>
      <Link to={SETTINGS} className={item} aria-current={active === "settings" ? "page" : undefined}>
        <SettingsIcon />
        <span>Settings</span>
      </Link>
    </nav>
  );
}

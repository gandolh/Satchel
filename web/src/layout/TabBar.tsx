import { CHATS, SETTINGS } from "../router";
import { ChatsIcon, SettingsIcon } from "./icons";
import { Link } from "./Link";

/** One tab: an icon in a pill over a label; the current one has the clay wash and an ink label. */
const item =
  "group grid min-h-14 content-center justify-items-center gap-0.5 text-small font-semibold text-muted no-underline aria-[current=page]:text-ink";
const icon =
  "grid h-8 w-14 place-items-center rounded-pill motion-safe:transition-colors motion-safe:duration-120 group-aria-[current=page]:bg-accent-soft group-aria-[current=page]:text-on-accent-soft [&_svg]:size-6";

/** Chats and Settings, along the bottom of the phone screen. From 900 px the rail says the same. */
export function TabBar({ active }: { active: "chats" | "settings" }) {
  return (
    <nav
      className="grid flex-none grid-cols-2 border-t border-line bg-surface pt-2 pb-[max(--spacing(3),env(safe-area-inset-bottom,0px))]"
      aria-label="Main"
    >
      <Link to={CHATS} className={item} aria-current={active === "chats" ? "page" : undefined}>
        <span className={icon}>
          <ChatsIcon />
        </span>
        <span>Chats</span>
      </Link>
      <Link to={SETTINGS} className={item} aria-current={active === "settings" ? "page" : undefined}>
        <span className={icon}>
          <SettingsIcon />
        </span>
        <span>Settings</span>
      </Link>
    </nav>
  );
}

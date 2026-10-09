import { CHATS, SETTINGS } from "../router";
import { ChatsIcon, SettingsIcon } from "./icons";
import { Link } from "./Link";

/** Chats and Settings, at the bottom of the list column (and of the phone screen). */
export function TabBar({ active }: { active: "chats" | "settings" }) {
  return (
    <nav className="tabbar" aria-label="Main">
      <Link to={CHATS} className="tabbar__item" aria-current={active === "chats" ? "page" : undefined}>
        <ChatsIcon />
        <span>Chats</span>
      </Link>
      <Link to={SETTINGS} className="tabbar__item" aria-current={active === "settings" ? "page" : undefined}>
        <SettingsIcon />
        <span>Settings</span>
      </Link>
    </nav>
  );
}

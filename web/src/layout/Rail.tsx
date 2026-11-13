import { cn } from "../lib/cn";
import { CHATS, SETTINGS } from "../router";
import { ChatsIcon, SettingsIcon } from "./icons";
import { Link } from "./Link";
import { Mark } from "./Mark";

/** One place on the rail: an icon over a label, in a pill when it is the current page. */
const item = cn(
  "grid size-14 place-content-center justify-items-center gap-0.5 rounded-md text-small font-semibold text-on-rail no-underline [&_svg]:size-6",
  "hover:bg-control-hover focus-visible:outline-focus-rail motion-safe:transition-colors motion-safe:duration-120",
  "aria-[current=page]:bg-rail-current aria-[current=page]:text-on-rail-current aria-[current=page]:shadow-[0_0_0_1px_var(--color-line)]",
  "aria-[current=page]:hover:bg-rail-current",
);

/** The wide screen's side rail: the brand mark, Chats and Settings. The phone's tab bar says the same under the list. */
export function Rail({ active }: { active: "chats" | "settings" }) {
  return (
    <nav
      className="flex min-h-0 flex-col items-center gap-2 border-r border-line bg-rail py-4 text-on-rail"
      aria-label="Main"
    >
      <Mark className="mb-4 size-10 rounded-md text-heading" />
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

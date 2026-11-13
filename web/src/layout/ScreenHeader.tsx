import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { goBack } from "../router";
import { BackIcon } from "./icons";
import { iconButton, safeX } from "./looks";

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Show the back arrow. It is hidden from 900px up, where the list is always beside. */
  back?: boolean;
  /** Before the titles, after the back arrow: an avatar, usually. */
  leading?: ReactNode;
  /** At the end of the bar. */
  actions?: ReactNode;
  /** The chat list's "Chats" is the page's h1; panes beside it use h2. */
  level?: 1 | 2;
  /** The large title: a screen's own name (Chats, Settings, New chat). The thread's name is the smaller one. */
  large?: boolean;
}

/** The bar at the top of every screen. */
export function ScreenHeader({
  title,
  subtitle,
  back = false,
  leading,
  actions,
  level = 2,
  large = false,
}: ScreenHeaderProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header
      className={cn(
        "flex min-h-[calc(var(--height-bar)+env(safe-area-inset-top,0px))] flex-none items-center gap-3 border-b border-line bg-surface pt-[env(safe-area-inset-top,0px)] wide:min-h-16",
        safeX,
      )}
    >
      {back && <BackButton />}
      {leading}
      <div className="min-w-0 flex-1">
        <Heading
          className={cn(
            "overflow-hidden text-ellipsis whitespace-nowrap",
            large ? "text-heading tracking-[-0.005em]" : "text-input font-semibold",
          )}
        >
          {title}
        </Heading>
        {subtitle && (
          <p className="overflow-hidden text-small text-ellipsis whitespace-nowrap text-muted">{subtitle}</p>
        )}
      </div>
      {actions}
    </header>
  );
}

/** Back to the chat list: the browser's Back when it stays in the app, otherwise a replace. */
export function BackButton() {
  return (
    <button type="button" className={cn(iconButton, "wide:hidden")} aria-label="Back to chats" onClick={goBack}>
      <BackIcon />
    </button>
  );
}

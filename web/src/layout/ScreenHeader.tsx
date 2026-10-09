import type { ReactNode } from "react";
import { goBack } from "../router";
import { BackIcon } from "./icons";

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
  large?: boolean;
}

/** The bar at the top of every screen. */
export function ScreenHeader({ title, subtitle, back = false, leading, actions, level = 2, large = false }: ScreenHeaderProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header className="bar">
      {back && <BackButton />}
      {leading}
      <div className="bar__titles">
        <Heading className={large ? "bar__title bar__title--large" : "bar__title"}>{title}</Heading>
        {subtitle && <p className="bar__subtitle">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

/** Back to the chat list: the browser's Back when it stays in the app, otherwise a replace. */
export function BackButton() {
  return (
    <button type="button" className="icon-button back-button" aria-label="Back to chats" onClick={goBack}>
      <BackIcon />
    </button>
  );
}

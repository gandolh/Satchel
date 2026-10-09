import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { navigate, pathFor, type Route } from "../router";

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: Route;
  /** Swap the current history entry instead of adding one. */
  replace?: boolean;
}

/**
 * An in-app link: a real `<a href>` (so middle-click and "open in new tab"
 * work) that navigates through the router on a plain left click.
 */
export function Link({ to, replace, onClick, target, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || target) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to, { replace });
  };
  return <a {...rest} href={pathFor(to)} target={target} onClick={handleClick} />;
}

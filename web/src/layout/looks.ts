/** Class strings the screens share. Tailwind reads each quoted string whole, so none is built from pieces. */

/** Left and right padding that clears a notch: 16 px, or the safe-area inset when that is larger. */
export const safeX =
  "pl-[max(--spacing(4),env(safe-area-inset-left,0px))] pr-[max(--spacing(4),env(safe-area-inset-right,0px))]";

/** A screen: a bar on top, a scrolling body beneath. */
export const screen = "flex min-h-0 min-w-0 flex-1 flex-col";
export const screenBody = "min-h-0 flex-1 overflow-y-auto overscroll-contain";

/** The round icon-only control in a bar: a button or a link around one 24 px icon, 48 px on a phone and 40 from 900 px. */
export const iconButton =
  "-ml-2 inline-grid size-12 flex-none place-items-center rounded-pill border-0 bg-transparent p-0 text-ink hover:bg-control wide:size-10 [&_svg]:size-6";

/** A line or two of loading, empty or error text inside a list column. */
export const listNote = "grid justify-items-start gap-3 px-4 py-6 text-compact text-ink-2";

/** A labelled form field: the label above, the input beneath. */
export const field = "grid gap-1";
export const fieldLabel = "text-meta text-muted";
export const fieldInput =
  "block min-h-11 w-full rounded-lg border border-line bg-sunk px-4 text-input text-ink focus-visible:outline-offset-1";

/** A failure under a form or a list: the server's or the network's words, in the error colour. */
export const errorLine = "text-compact text-pretty text-bad";

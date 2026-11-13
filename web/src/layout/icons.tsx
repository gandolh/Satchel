/** Line icons on a 24px grid, drawn with currentColor. Decorative: label the control, not the icon. */

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

export function BackIcon() {
  return (
    <svg {...base}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...base} strokeWidth={3.2}>
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

export function ChatsIcon() {
  return (
    <svg {...base}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...base}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

/** A magnifier: the search field's mark. */
export function SearchIcon() {
  return (
    <svg {...base}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

/** A pencil: the New chat control. */
export function NewChatIcon() {
  return (
    <svg {...base}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

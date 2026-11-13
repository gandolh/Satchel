---
summary: How the web app looks and behaves. A conventional messenger (chat list, thread, composer, settings) with no metaphor; the Clay on graphite colour and type tokens for light and dark; the tick, "Seen" and failed-send states; phone-first layout and the PWA install. Read before any UI brief.
updated: 2026-11-13
---

# Design

The owner prefers familiar UI over a bold metaphor: navigation must look like
any messenger. The mockups are in the design artifact linked from
[overview.md](overview.md).

## Screens

- **Chats.** A list. The Ideas inbox is pinned first with Claude's avatar (a
  green circle with "C"), then the other conversations by latest message. Each
  row: avatar, name, last message preview, time, and either an unread badge
  or, when my message is last, its tick.
- **Thread.** Header with back arrow, avatar, name and a one-line subtitle
  ("Ideas inbox", or the member names of a group). Day separators ("Today",
  "Yesterday", then dates). My bubbles on the right in the accent colour,
  others on the left on the surface colour, with the sender's name in groups.
  Composer at the bottom: a text field that grows to five lines and a Send
  button, 48 px tall, the thread's one filled primary (empty, it is a pale clay
  wash with muted text). Enter sends on desktop; Shift+Enter is a new line.
- **Settings.** Signed-in name and Sign out, then Notifications (everyone),
  then Connect Claude (the owner only).

Phone first: the thread and the list are full-screen views on a phone, with
a bottom tab bar (Chats, Settings) that hides inside a thread. On the chat
list a 56 px clay New chat button sits bottom right, 16 px above the tab bar.
From 900px up, a 72px side rail (the clay S, Chats, Settings) sits left of a
340px list, and the thread or Settings fills the rest; there is no back arrow
and no tab bar, and the pencil is in the list header. See
[decisions.md](decisions.md), "The redesign: Clay on graphite".

## Message states

| State | Look |
|---|---|
| Sending | bubble at full colour; its meta line reads "Sending…", no tick |
| Sent, not seen by everyone | one drawn tick, spoken "Sent" |
| Seen by everyone else | two drawn ticks, spoken "Seen" |
| Not sent | surface-coloured bubble with a dashed border in `--bad`, and "Not sent. Tap to retry" under it |
| Seen line | small muted text under the last seen message: "Seen 21:40" (one other member) or "Seen by Maria, Andrei" (group) |

Group and one-to-one threads show a small centred pill at the top: "Claude has
no access to this chat". The inbox doesn't.

## Tokens

The tokens live in `@theme` in `web/src/styles/index.css`, the app's one
stylesheet. A colour is `--color-<name>` (so `bg-surface`, `text-muted`) and holds
both themes in one `light-dark()` value; `color-scheme` on `<html>` picks one.
Graphite neutrals, one clay accent. Light values first, dark in brackets.

```
bg        #F0F3F6  (#101419)    the thread, the forms' page
surface   #FCFEFF  (#1F2329)    the chat list, bars, composer, cards
sunk      #EAEDF2  (#151A1F)    input fill
control   #E1E5EA  (#2E333A)    secondary buttons, avatars, day pills
row-hover #F2F5F8  (#262B31)    a chat row under the pointer
line      #DBDEE3  (#363B41)    dividers, bar and bubble edges
outline   #70757C  (#81878D)    edges that must be seen: fields, checkbox, switch
ink       #181B1F  (#E6EAEE)    names and message text
ink-2     #3F4348  (#C4C8CC)    previews, secondary text
muted     #5C6167  (#A0A5AB)    times, hints, tab labels
accent    #9E4502  (#EB9C6A)    unread, links, Send, the New chat button
accent-ink #FFFDFC (#1E130E)    text on accent
accent-soft #F9E3D6 (#412A1E)   the current tab, a picked person, an empty Send
sent      #9E4502  (#7B3C17)    my bubbles (on-sent, on-sent-meta for text and ticks)
bubble-in #FCFEFF  (#282D34)    other people's bubbles
ok        #176E4A  (#66C093)    Claude's avatar (ok-soft, on-ok-soft: the Ideas inbox row)
bad       #B02B27  (#F98F87)    not-sent state, Sign out
rail, on-rail, rail-current, on-rail-current   the side rail
focus, focus-rail                              every focus ring
```

Also `control-hover`, `accent-press`, `on-accent-soft`, `on-ok`, two mixes
(`row-pinned-hover`, `row-pinned-current`) and one shadow (`float`: soft in light, a
hairline alone in dark, where the surface is lifted instead). Spacing is
Tailwind's own scale (4 px a step). Radii: `sm` 6, `md` 10, `bubble` 18, `pill`.
Sizes: `--width-list` (the 340 px column beside the 72 px rail) and
`--height-bar` (56 px). The type scale: `small` 12/16, `compact` 14/20, `body` and
`input` 16/24, `heading` 20/28 at 700, `hero` 28 (the large brand mark). Tailwind's
own colour, text, radius, shadow and breakpoint scales are cleared, so `text-sm`
yields nothing.

Type: Rethink Sans (400, 600, 700; latin and latin-ext) for everything, IBM Plex
Mono only in Settings for the token. Self-host the font files with the build
(`@fontsource/rethink-sans`, pinned); don't load Google Fonts at runtime. Motion
is colour only, 120 ms, and none under reduced motion.

Theme: a Light / Dark / System choice in Settings, kept on the device
(`localStorage`), light on a first visit even when the system is dark. A script
in `index.html` sets `data-theme` on `<html>` before the first paint, and the
browser bar's colour (the accent of each theme: `THEME_COLOR`, the boot script, the manifest) follows it. A dark theme is the same tokens, not `dark:`
classes. The rail layout starts at 900 px: the `wide:` variant, and
`WIDE_QUERY` in `web/src/polling.ts`, which a test keeps equal.

## PWA

Installable: a manifest with name "Satchel", the accent as theme colour, icons
at 192 and 512 px, `display: standalone`, scope and start URL the build's base:
`/` in production on `satchel.<domain>`, `/satchel/` in local dev.
The service worker caches the app shell only. It never caches API responses:
messages always come from the server.

On Android the manifest's `share_target` (a GET to `<base>share`, since 2026-10-28)
puts Satchel in the share sheet. A share opens the Ideas inbox with the text
or link in the composer, unsent; a friend's goes to the first chat they open.
Safari ignores it, so the iPhone has no share entry and loses nothing.
`web/src/share/share.ts` turns the share's query into one message at start-up
and keeps it in the tab's sessionStorage, which survives the "Sign in with
Ward" round trip (that returns to the bare `/share`, since a share can be
longer than the 512-character `returnTo`). Signed in, it becomes an in-memory
draft the composer shows once; the text never goes to the server, and the
composer isn't focused, so Android's keyboard doesn't cover the thread.

The service worker is built with `injectManifest` and registered as `prompt`:
a new version applies the next time the page is hidden, so nobody is reloaded
mid-typing. A thread's first load pages forward 200 messages at a time, ten
pages at most; there is no "load older" control.

## Where the Base UI wrappers live
`web/src/components/ui/` holds `Switch.tsx` and `Checkbox.tsx`, the only files that import Base UI. Features import the wrappers.

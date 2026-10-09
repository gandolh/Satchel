---
summary: How the web app looks and behaves. A conventional messenger (chat list, thread, composer, settings) with no metaphor; the colour and type tokens for light and dark; the tick, "Seen" and failed-send states; phone-first layout and the PWA install. Read before any UI brief.
updated: 2026-10-09
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
  button. Enter sends on desktop; Shift+Enter is a new line.
- **Settings.** Signed-in name and Sign out, then Notifications (everyone),
  then Connect Claude (the owner only).

Phone first: the thread and the list are full-screen views on a phone, with
a bottom tab bar (Chats, Settings) that hides inside a thread. From 900px up,
the list sits left (320px) and the thread or Settings fills the rest; there
is no back arrow and no tab bar.

## Message states

| State | Look |
|---|---|
| Sending | bubble at 70% opacity, no tick |
| Sent, not seen by everyone | one tick `✓` in the bubble meta |
| Seen by everyone else | two ticks `✓✓`, full opacity |
| Not sent | surface-coloured bubble with a dashed border in `--bad`, and "Not sent. Tap to retry" under it |
| Seen line | small muted text under the last seen message: "Seen 21:40" (one other member) or "Seen by Maria, Andrei" (group) |

Group and one-to-one threads show a small centred pill at the top: "Claude has
no access to this chat". The inbox doesn't.

## Tokens

Light values first, dark in brackets. Neutrals lean slightly green.

```
--bg        #F2F5F4  (#0E1412)    page and thread background
--surface   #FFFFFF  (#161F1C)    bars, list rows, other people's bubbles
--sunk      #E8EDEB  (#1C2723)    day separators, input fill
--ink       #14201C  (#E3EAE7)    text
--muted     #56645F  (#98A6A1)    secondary text, times
--line      #D3DCD8  (#2A3631)    borders, dividers
--accent    #2A45C4  (#8DA0FF)    my bubbles, links, badges, Send
--accent-ink #FFFFFF (#0E1412)    text on accent
--accent-soft #E6EAFB (#1D2547)   the pinned inbox row, soft highlights
--ok        #1D7650  (#62C796)    Claude's avatar
--bad       #B3261E  (#FF8A80)    not-sent state
```

Type: Familjen Grotesk (600, 700) for titles and names, Instrument Sans (400,
500, 600) for everything else, IBM Plex Mono only in Settings for the token.
Self-host the font files with the build; don't load Google Fonts at runtime.

Theme follows the system (`prefers-color-scheme`). No toggle in phase 1.

## PWA

Installable: a manifest with name "Satchel", the accent as theme colour, icons
at 192 and 512 px, `display: standalone`, scope and start URL `/satchel/`.
The service worker caches the app shell only. It never caches API responses:
messages always come from the server.

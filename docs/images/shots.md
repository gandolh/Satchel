# README images

How each image was made, so the next refresh is a re-run. Re-take an image
when the screen it shows changes. All of them show the "Clay on graphite"
redesign of 2026-11-13.

All of them come from `npm run dev`'s two halves, run against a scratch
`DATA_DIR` on spare ports, signed in as a local `owner` account made with
`npm run seed -w @satchel/server` (password from a random env var), and
filled by [demo-seed.mjs](demo-seed.mjs). No Ward runs. The friends, Maya,
Theo and Ana, are made up and never sign in, so no real account or message
appears. The seed backdates messages relative to the day it runs, so the
dates in a new capture will differ.

The seed's messages for today run until 14:06. Capture in the evening, or the
GIF's new idea gets an earlier time than the ideas above it. On 2026-11-16
the shots were taken in the morning, so the API ran with its clock moved to
19:28 local time by a scratch `node --import` file that offsets `Date` (passed
through `NODE_OPTIONS`; it is not in the repo). The browser and the CLI ran
on the real clock.

| File | Shows | How to reach that state | Viewport | Taken |
|---|---|---|---|---|
| ideas-inbox.webp | Ideas inbox, three ideas seen by Claude and two not | Fresh seed, open "Claude · Ideas inbox" | iPhone 14 at its full 390×844 screen, @3x, scaled to 780 px wide | 2026-11-16 |
| chat-list.webp | Chat list: inbox pinned, an unread badge, a group, a seen direct chat | Fresh seed, `/satchel/` | same | 2026-11-16 |
| group-chat.webp | The Weekend hike group with "Seen by Maya, Theo" | Fresh seed, open "Weekend hike" | same | 2026-11-16 |
| desktop.webp | Rail, chat list and the Weekend hike group open | Fresh seed, open "Weekend hike" | 1440×900 @2x, 2880 px wide | 2026-11-16 |
| send-and-seen.gif | Sending an idea, then "Seen" moving under it | After `satchel seen 12`, open the inbox, type and send "Idea: a shared packing list for the hike group.", then run `satchel unread` and `satchel seen 16` from the CLI | iPhone 14, 390 px GIF, 9.2 s | 2026-11-16 |
| connect-claude.webp | The Connect Claude card with one token | `/satchel/settings` after the CLI has used the seeded token; clipped to the card plus 16 px | iPhone 14, card only, 780 px | 2026-11-16 |

The `satchel unread` output in the README is real output from the same
seeded database, taken before the GIF was recorded.

## Capture method

- Browser: Playwright's Chromium from a scratch script,
  `devices['iPhone 14']` with the viewport set to the full 390×844 screen
  (the installed PWA has no browser bar), time zone Europe/Bucharest,
  locale en-GB, default (light) theme. Each shot waits for network idle and
  1.5 s more. Sign in once through the form and reuse the storage state.
- CLI: built `cli/dist/index.js` run by path with `SATCHEL_URL` set to the
  local API, the seeded token in `SATCHEL_TOKEN`, `TZ=Europe/Bucharest`, and
  `HOME` pointed at an empty folder so a real `~/.config/satchel/env` is
  never read.
- Stills: PNG to WebP with
  `ffmpeg -i in.png -vf scale=780:-1 -c:v libwebp -quality 82 out.webp`
  (the desktop one without the scale).
- GIF: one screenshot per step (the open inbox, the focused composer, seven
  stages of typing, the sent idea with one tick, then "Seen" after the CLI
  ran), joined with ffmpeg's concat demuxer: 1.5 s at the start, 0.25 s per
  typing frame, 2 s after Send and 3 s on "Seen". Then a two-pass palette at
  10 fps and 390 px wide.
- Never capture Connect Claude right after "Create token": that screen shows
  the token in full.

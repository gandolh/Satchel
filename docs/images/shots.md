# README images

How each image was made, so the next refresh is a re-run. Re-take an image
when the screen it shows changes.

All of them come from a throwaway clone running `npm run dev` against a
scratch `DATA_DIR`, signed in as the owner through the local Ward container,
and filled by [demo-seed.mjs](demo-seed.mjs). The friends, Maya, Theo and
Ana, are made up and never sign in, so no real account or message appears. The
seed backdates messages relative to the day it runs, so the times and dates
in a new capture will differ.

| File | Shows | How to reach that state | Viewport | Taken |
|---|---|---|---|---|
| ideas-inbox.webp | Ideas inbox, three ideas seen by Claude and two not | Fresh seed, open "Claude · Ideas inbox" | iPhone 14, 390×844 @3x, scaled to 780 px wide | 2026-10-09 |
| chat-list.webp | Chat list: inbox pinned, an unread badge, a group, a seen direct chat | Fresh seed, `/satchel/` | iPhone 14, scaled to 780 px | 2026-10-09 |
| group-chat.webp | The Weekend hike group with "Seen by Maya, Theo" | Fresh seed, open "Weekend hike" | iPhone 14, scaled to 780 px | 2026-10-09 |
| send-and-seen.gif | Sending an idea, then "Seen" moving under it | After `satchel seen` on the seeded unread ideas, open the inbox, record, type and send, then run `satchel unread` and `satchel seen N` from the CLI | iPhone 14, 390 px GIF, 9.5 s | 2026-10-09 |
| connect-claude.webp | The Connect Claude card with one token | `/satchel/settings` after the CLI has used the seeded token; cropped to the card | iPhone 14, card only, 780 px | 2026-10-09 |
| desktop.webp | Two-pane layout with the Weekend hike group open | Fresh seed, open "Weekend hike" | 1280×800 @2x, scaled to 1600 px | 2026-10-09 |

The `satchel unread` output in the README is real output from the same
seeded database, taken before the GIF was recorded.

## Capture method

- Browser: `agent-browser`, `set device "iPhone 14"` for phone shots and
  `set viewport 1280 800 2` for the desktop one, then `screenshot` with an
  absolute path.
- CLI: built `cli/dist/index.js` run by path with `SATCHEL_URL` set to the
  local API and the seeded token in `SATCHEL_TOKEN`, and `HOME` pointed at
  an empty folder so a real `~/.config/satchel/env` is never read.
- Stills: PNG to WebP with
  `ffmpeg -i in.png -vf scale=780:-1 -c:v libwebp -quality 82 out.webp`.
- GIF: `record start` / `record stop` gives a WebM that only holds frames
  where the screen changed. The GIF is built from its extracted frames, re-timed with
  ffmpeg's concat demuxer: 1.5 s at the start, the typing, 2 s after Send and
  3 s on "Seen". Then a two-pass palette at 10 fps and 390 px wide.
- Never capture Connect Claude right after "Create token": that screen shows
  the token in full.

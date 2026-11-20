# The redesign: "Clay on graphite"

This folder is the design record of Satchel's redesign. The estate redesign board, where it was drawn and approved, is a private canvas; this is a copy of the app's page on it plus the build behind that page. The owner approved it on 2026-11-13, and [brief 05](../../corpus/briefs/done/05-a-redesign-with-hallmark-on-the-estate-board.md) built it. The code is now the source of truth: where the app and these files differ, the app wins, and later work may have moved a screen on. Read this folder to see what was decided and why before reshaping a screen.

## The owner's decisions

The owner approved the whole board on 2026-11-13, with every question standing at what the board proposed unless they reopened it. The questions this app's page asked:

- **Ask:** 1. Reopened: from 900 px a 72 px side rail (Chats, Settings) replaces the tab bar under the list; on a phone the bar stays and New chat becomes a bottom-right button, so the empty-state line "Start one with the pencil above" would read "Start one with the New chat button". Keep the rail and the new wording, or keep today's bar and pencil? 2. Reopened: the clay accent replaces the indigo, and Rethink Sans replaces Familjen Grotesk and Instrument Sans (still self-hosted in the build): yes, or keep today's? 3. Approve Clay on graphite as Satchel's direction?
- **Reopened:** Recorded (wiki/design.md, 2026-11-02): "From 900px up, the list sits left (320px) and the thread or Settings fills the rest; there is no back arrow and no tab bar." The app already shows a tab bar under the list at 1280 (today's shot). Proposed: a 72 px rail left of a 340 px list holds the two places, as research 2.12 sets for medium screens and up [S9]. On a phone the bottom bar stays.
- **Reopened:** Recorded (wiki/design.md, "Message states"): "Sending: bubble at 70% opacity, no tick". Measured, the message text at 70% over the page is 2.5:1 in light, under the 4.5 gate. Proposed: the bubble stays at full colour, the meta line reads "Sending…" and has no tick.
- **Reopened:** Recorded (wiki/design.md, "Tokens" and "Type"): an indigo accent and Familjen Grotesk plus Instrument Sans. Proposed: a clay accent, with Claude's green kept for its avatar and the Ideas inbox, and Rethink Sans alone at four sizes (today: eleven sizes down to 10 px). Everything else in the token table keeps its role names. A taste call, so it is in the ask.

Where the files below disagree, the later layer wins: the owner's decisions, then the controller's rulings, then the judges' rulings, then the directions file.

## What is here

| Path | What it holds |
|---|---|
| `critiques/satchel.md` | The design critic's review against today, and the controller's rulings over it. |
| `manifests/satchel.tokens.css`, `manifests/satchel.tokens-map.md` | The token hand-off in the app's own names, and the renamed, new and unused tokens. |
| `manifests/satchel.board-notes.md` | What the board said beside the screens: the asks, decisions, reopened rules, open questions, the contrast table and the runner-up. |
| `canvas/satchel-*.dc.html` | The board's own artboards for the direction sheet and the proposed screens: HTML and CSS in the board's component format (a `<x-dc>` page with `{{…}}` values filled by the script at its foot). They need the board's runtime to render, so read them as source; no rendered picture of them exists outside the board. |
| `shots/satchel/` | Today's screens as the board showed them before the redesign. |

People's names and data in the pictures come from seeded demo accounts or are invented.

## Not here

The sketches and the judges' images, the runner-up's build (its notes are in the board's notes), the build's scripts, and the screenshots taken while it was built. They stay in the estate build folder.

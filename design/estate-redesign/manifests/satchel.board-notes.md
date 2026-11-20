# The board's notes: Satchel

The estate redesign board is a private canvas. This file copies what its page for this app said beside the screens: the owner's asks, the decisions, the rules the design reopened, the open questions and the Floor. The owner's answers are in [README.md](../README.md#the-owners-decisions).

## Asks to the owner

- 1. Reopened: from 900 px a 72 px side rail (Chats, Settings) replaces the tab bar under the list; on a phone the bar stays and New chat becomes a bottom-right button, so the empty-state line "Start one with the pencil above" would read "Start one with the New chat button". Keep the rail and the new wording, or keep today's bar and pencil? 2. Reopened: the clay accent replaces the indigo, and Rethink Sans replaces Familjen Grotesk and Instrument Sans (still self-hosted in the build): yes, or keep today's? 3. Approve Clay on graphite as Satchel's direction? (beside `satchel-direction`)

## Decisions

- On a phone, New chat is a 56 px clay button, bottom right above the tab bar, within thumb reach on Android, where the pencil in the top corner was the farthest point. From 900 px the pencil stays in the list header. (beside `satchel-proposed-chat-list-1280`)
- The rail takes the control tone in light and the ground tone in dark, each with a hairline edge, and the current place is a surface pill. It no longer outweighs the list, and in dark it does not sit darker than the ground. (beside `satchel-proposed-chat-list-1280`)
- The pinned Ideas inbox keeps its place, its green avatar and its green wash. "Claude · Ideas inbox" no longer joins the two with a middle dot: the name is a name and "Ideas inbox" is a small label beside it (Hallmark Floor 10). (beside `satchel-proposed-chat-list-1280`)
- An unread chat shows its time in the clay and a numbered badge, and the count is still read aloud. Colour is never the only signal: the number is there [conv, research 3 Messenger]. (beside `satchel-proposed-chat-list-1280`)
- The open chat is the strongest row: a control-grey fill with a white avatar disc, the name in 700 and the 4 px clay bar. The pinned Claude row keeps its green wash and no longer outshouts it. (beside `satchel-proposed-thread-1280`)
- My bubbles are clay with light text (6.26:1 light, 7.57:1 dark). Time and ticks on them take a solid colour of their own (5.37:1), not 80% opacity as today. In dark the bubble is a deeper, calmer clay so it does not glow [S14, S7]. (beside `satchel-proposed-thread-1280`)
- Consecutive messages from one person join: a 6 px corner on the joined side and a 2 px gap. Day pills and the "Claude has no access to this chat" notice keep today's copy. The sender's name stays above a group's first bubble. (beside `satchel-proposed-thread-1280`)
- Ticks are drawn icons, one for sent and two for seen, with the same spoken labels as today ("Sent", "Seen"), plus the "Seen 16:14" line. State is the count, never colour alone [S12 conv]. (beside `satchel-proposed-thread-1280`)
- Send is the thread's only filled primary, 48 px. Empty, it is a pale clay wash with muted text (5.05:1), warm like today's pale button but plainly inert; the comp shows a typed draft so the filled Send is seen. The field has a 3:1 edge, which today's grey-on-grey field lacks (WCAG 1.4.11). (beside `satchel-proposed-thread-1280`)
- Both fields get a visible label above them. Today "Search people" is a placeholder with an aria-label; a placeholder is not a label [S40, research 2.10]. This is the only copy change on the three screens. (beside `satchel-proposed-new-group-1280`)
- A picked person gets a clay wash with the name still in ink, a hairline between picked rows and a 24 px checkbox inside a 48 px target, so the whole row works as the target (the Base UI Checkbox keeps its wrapper, restyled). (beside `satchel-proposed-new-group-1280`)
- Create group is the screen's one primary; Cancel is an outlined-weight secondary pill again, as today. On a phone the count, Cancel and Create group are pinned to a surface bar above the tab bar, so they never scroll away; from 900 px they stay in the flow. (beside `satchel-proposed-new-group-1280`)

## Reopened rules

- Recorded (wiki/design.md, 2026-11-02): "From 900px up, the list sits left (320px) and the thread or Settings fills the rest; there is no back arrow and no tab bar." The app already shows a tab bar under the list at 1280 (today's shot). Proposed: a 72 px rail left of a 340 px list holds the two places, as research 2.12 sets for medium screens and up [S9]. On a phone the bottom bar stays. (beside `satchel-proposed-chat-list-1280`)
- Recorded (wiki/design.md, "Message states"): "Sending: bubble at 70% opacity, no tick". Measured, the message text at 70% over the page is 2.5:1 in light, under the 4.5 gate. Proposed: the bubble stays at full colour, the meta line reads "Sending…" and has no tick. (beside `satchel-direction`)
- Recorded (wiki/design.md, "Tokens" and "Type"): an indigo accent and Familjen Grotesk plus Instrument Sans. Proposed: a clay accent, with Claude's green kept for its avatar and the Ideas inbox, and Rethink Sans alone at four sizes (today: eleven sizes down to 10 px). Everything else in the token table keeps its role names. A taste call, so it is in the ask. (beside `satchel-direction`)

## The Floor

- Contrast is scripted over 67 pairs in both themes: text min 4.94 light and 5.13 dark, edges and icons min 3.75 and 3.67, focus ring min 5.77 and 5.93, all AA. Nothing overflows sideways at 1280, 1024, 768, 390 or 360 in either theme, and the phone layout shows under 900 px. Phone targets are 48 px or more (the avatar and the unread badge are not targets); the New chat button is 56 px, and on the group form the count, Cancel and Create group stay pinned above the tab bar with the people list scrolling behind them. Surface separation: list on thread 1.10 light and 1.17 dark, plus a 1 px rule edge (1.21 light, 1.64 dark); the open row on its list 1.25; the rail on the thread 1.14 light and an edge in dark. Motion is colour-only, 120 ms. Sloplint --scope app gives 0 FAIL and 0 REFLEX on the six comps, with 72 waived (clipped previews), F7 and F25 dismissed (circles by shape; the list is drawn once per layout). The fixed 1440 sheet is not linted. Every screen's loading, empty and error states are on this sheet. Settings, Sign-in and Share are not drawn. (beside `satchel-direction`)

## Other notes

- Today's empty pane ("Pick a chat to read it here.") keeps its copy and its mark. Chat times in the comps are invented for one afternoon; the capture's clock reads 16:51 on every row.
- Satchel has no menu, dialog or drawer, so the component strip draws what it does have: the Switch and Checkbox wrappers, the offline toast and the New messages button. Reactions, reply-to, attachments and message editing are not drawn: decisions.md says text only, and messages are append-only.
- The comps load Rethink Sans from Google Fonts for the board only. In the app it would be self-hosted with the build, as wiki/design.md requires. Both of today's faces are on Google Fonts too, so the Today and Proposed rows compare fairly.
- Round 2: what changed and why. 1. Cancel is the secondary pill again (it had become bare text). 2. Disabled Send is a pale clay wash, not grey, and the thread comp shows a typed draft. 3. The open chat is the strongest row: control fill, white avatar disc, name 700, clay bar. 4. Phone: New chat is a 56 px bottom-right button. 5. Phone: count, Cancel and Create group are pinned above the tab bar. 6. The rail is light in light and ground-toned in dark, with a hairline edge and a surface pill. 7. Picked people keep ink names and a hairline between them. 8. The sheet's headline names clay as the one accent, not 'what you sent'. 9. Dark surfaces are lifted: list on thread 1.17, so lists and bubbles read as raised. 10. The twin's frame fills tall viewports, so 768 has no white band. Round 1 is kept beside as archive artboards. Not done: collapsing a repeated same-minute time on joined bubbles, since it changes today's per-bubble time.

## Contrast, as measured

| Pair | Light | Dark | Needs |
|---|---|---|---|
| ink on ground | 15.51 | 15.29 | 4.5 |
| ink on surface | 17.08 | 13.05 | 4.5 |
| ink on field | 14.72 | 14.48 | 4.5 |
| ink on control-hover | 12.19 | 8.77 | 4.5 |
| ink on row-hover | 15.79 | 11.8 | 4.5 |
| ink on control | 13.66 | 10.52 | 4.5 |
| ink on bubble-in | 17.08 | 11.46 | 4.5 |
| ink on claude-wash (Ideas inbox row) | 15.08 | 11.93 | 4.5 |
| ink-2 on surface (preview) | 9.85 | 9.38 | 4.5 |
| ink-2 on row-hover | 9.11 | 8.48 | 4.5 |
| ink-2 on control | 7.87 | 7.56 | 4.5 |
| ink-2 on claude-wash | 8.7 | 8.57 | 4.5 |
| muted on ground (day pill, seen line) | 5.61 | 7.45 | 4.5 |
| muted on control (day pill, avatar) | 4.94 | 5.13 | 4.5 |
| muted on surface (time, tab label) | 6.18 | 6.36 | 4.5 |
| muted on field (placeholder) | 5.32 | 7.06 | 4.5 |
| muted on row-hover (time) | 5.71 | 5.75 | 4.5 |
| muted on claude-wash (time) | 5.45 | 5.81 | 4.5 |
| muted on bubble-in (time) | 6.18 | 5.59 | 4.5 |
| accent on surface (unread time, link) | 6.28 | 7.14 | 4.5 |
| accent on ground | 5.7 | 8.36 | 4.5 |
| accent on row-hover (unread time) | 5.81 | 6.45 | 4.5 |
| accent on control (unread time) | 5.02 | 5.75 | 4.5 |
| accent on claude-wash (unread time) | 5.55 | 6.52 | 4.5 |
| accent on bubble-in (sender name in a group) | 6.28 | 6.27 | 4.5 |
| accent-hover on surface | 8.38 | 9.11 | 4.5 |
| on-accent on accent (Send, badge) | 6.26 | 8.22 | 4.5 |
| on-accent on accent-hover | 8.36 | 10.5 | 4.5 |
| on-accent-wash on accent-wash | 8.42 | 9.16 | 4.5 |
| ink on accent-wash (picked person) | 13.98 | 11.03 | 4.5 |
| on-sent on sent (message text) | 6.26 | 7.57 | 4.5 |
| on-sent-meta on sent (time, ticks) | 5.37 | 6.21 | 4.5 |
| on-claude on claude (the C) | 6.16 | 8.14 | 4.5 |
| on-claude-wash on claude-wash (inbox name) | 9.06 | 9.69 | 4.5 |
| bad on ground (not-sent text) | 5.85 | 8.19 | 4.5 |
| bad on surface (Sign out) | 6.45 | 6.99 | 4.5 |
| bad on field (error text) | 5.56 | 7.76 | 4.5 |
| bad dashed edge on ground | 5.85 | 8.19 | 3 |
| on-rail on rail (icons, labels) | 7.87 | 9.24 | 4.5 |
| on-rail-current on rail-current | 17.08 | 10.84 | 4.5 |
| rail-current pill (surface) on rail | 1.25 | 1.52 | 1.09 |
| surface on ground (list against thread; needs 1.09 light, 1.15 dark) | 1.1 | 1.17 | 1.09 |
| rule edge on ground (the 1px edge that carries a surface in dark) | 1.21 | 1.64 | 1.2 |
| bubble-in on ground (also a 1px rule edge) | 1.1 | 1.33 | 1 |
| rail on ground (also a 1px rule edge) | 1.14 | 1 | 1 |
| surface (open chat's avatar disc) on control | 1.25 | 1.24 | 1.09 |
| accent-wash (disabled Send) on surface | 1.22 | 1.18 | 1.09 |
| muted on accent-wash (disabled Send label) | 5.05 | 5.38 | 4.5 |
| on-accent on accent (New chat button icon) | 6.26 | 8.22 | 3 |
| accent (New chat button) on ground | 5.7 | 8.36 | 3 |
| outline (field edge) on field | 3.95 | 4.82 | 3 |
| outline (field edge) on surface | 4.59 | 4.35 | 3 |
| outline (field edge) on ground | 4.17 | 5.09 | 3 |
| outline (checkbox edge) on surface | 4.59 | 4.35 | 3 |
| outline (checkbox edge) on accent-wash | 3.75 | 3.67 | 3 |
| outline (switch track, off) on surface | 4.59 | 4.35 | 3 |
| accent (checked box, switch on) on surface | 6.28 | 7.14 | 3 |
| on-accent (check mark) on accent | 6.26 | 8.22 | 3 |
| claude (avatar fill) on surface | 6.17 | 7.16 | 3 |
| focus ring on ground | 6.56 | 8.61 | 3 |
| focus ring on surface | 7.22 | 7.35 | 3 |
| focus ring on field | 6.22 | 8.16 | 3 |
| focus ring on control | 5.77 | 5.93 | 3 |
| focus ring on claude-wash | 6.38 | 6.72 | 3 |
| focus ring on rail | 5.77 | 8.61 | 3 |
| rule on surface (hairline, Lc 15 target) | 1.33 | 1.4 | 1.2 |
| on-callout on callout (board marker) | 8.29 | 6.53 | 4.5 |

## The artboards on the board

- Direction · Clay on graphite
- Chat list · 1280 · light · today
- Chat list · 390 · light · today
- Thread · 1280 · light · today
- Thread · 390 · light · today
- New group · 1280 · light · today
- New group · 390 · light · today
- Chat list · 1280 · light · proposed
- Chat list · 390 · dark · proposed
- Thread · 1280 · light · proposed
- Thread · 390 · dark · proposed
- New group · 1280 · light · proposed
- New group · 390 · dark · proposed
- Chat list · 1280 · light · proposed · round 1
- Chat list · 390 · dark · proposed · round 1
- Thread · 1280 · light · proposed · round 1
- Thread · 390 · dark · proposed · round 1
- New group · 1280 · light · proposed · round 1
- New group · 390 · dark · proposed · round 1

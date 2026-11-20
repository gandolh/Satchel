fix

# Satchel redesign, critic's findings (2026-11-12)

I looked at the screens first and read the manifest after. The direction holds. Three surface tones keep the screen apart in both themes: the list on `surface`, the thread on `ground`, and the bars on `surface` over a hairline. Nothing got flatter than today. What's owed is a set of state and affordance fixes, plus one call on the rail's colour.

These aren't findings, they come from the render rig. The 44 px grey gutters and the purple numbered dots at 900 px and up are the board's callout stage. The white band under the 768 renders comes from the twin's `.frame { height: 844px }` in a 768×1024 viewport. Fix the twin so `.frame` fills the viewport with `min-height: 100dvh`, or the 768 comp looks broken to the owner.

## Regressions against today

1. **New group, Cancel, all widths.** Today Cancel is an outlined 44 px pill beside Create group, so both read as buttons. Proposed, it's bare 14/600 text with no box, and next to the "2 picked." line it reads as a third label. Fix: use the sheet's own secondary button, the one "Try again" uses. That's a `control` fill (#e1e5ea light, #292e35 dark), 40 px tall, radius full, 20 px side padding. Create group stays the only filled clay button.
2. **Thread, the composer at rest, all widths.** Today's disabled Send keeps the brand colour, a pale indigo, so the bottom of the thread reads as the place you act. Proposed, Send is `control` grey with muted text beside a grey field. The field's 1 px #70757c edge is the darkest line on the screen, so the empty field outweighs the button, and the resting thread shows no clay at the composer. Fix, two parts. In the app, draw disabled Send as an `accent-wash` pill (#f9e3d6 light, #412a1e dark) with `muted` text: warm, and still plainly inert. In the comp, type a word into the field so the owner sees the filled clay Send the sticky promises. Keep the 3:1 field edge for 1.4.11.

Nothing else regressed. Reading order, the unread signal (clay time plus a numbered badge), ticks, the "Seen" line, day pills, the empty pane and the back arrows all carry over. New group got clearly better.

## Priority issues, ranked by cost to the user

1. **The open chat is the weakest highlight in the list.** Thread at 900 px and up, both themes. The open row is #e6eaef on #fcfeff, 1.19:1, so the 4 px clay bar is nearly all that marks it. The pinned Claude row is louder, with its green wash, green name and green avatar, and the eye lands there as if Claude were open. Today has the same order, so it isn't a regression, but the redesign should fix it. Fix: put the open row on `control` (#e1e5ea, #292e35 dark) and give that row's avatar a `surface` fill, because `.av` is `control` too and would vanish. Keep the 4 px clay bar and set the name to 700. Leave the pinned green wash as recorded.
2. **New chat is out of thumb reach on the phone.** Chat list at 390 and 360. The pencil sits top right, the farthest point from an Android thumb. Android is the main phone, and Android messengers like WhatsApp and Google Messages put this action at the bottom right. Fix: under 900 px, move it into a 56 px clay button with `radius-bubble` 18, 16 px from the right edge and 16 px above the tab bar, aria-label "New chat". In light it takes the `float` shadow. In dark the peach fill on #101419 carries it and the hairline stays. The empty-state line "Start one with the pencil above" then needs a word changed, so flag that to the owner.
3. **Create group scrolls away.** New group, worst on the phone. The actions sit in the flow under the people card, and past six or seven contacts they drop below the fold at 390. Fix: under 900 px, pin "2 picked." with Cancel and Create group to a bar on `surface` directly above the tab bar, with a 1 px `rule` top edge and 12/16 px padding. Keep them in the flow from 900 px up.
4. **The rail is the heaviest object in the light theme.** 900 px and up. A rail is a convention and I'd keep it: Settings stays labelled and one click away. But a #1a2027 slab holding two items pulls the eye before the list on a light page, and it reads as Slack chrome rather than Satchel. In dark it inverts elevation, because the rail at #070a0f is darker than the ground at #101419. Fix: in light, put the rail on `control` #e1e5ea with a 1 px `rule` right edge, the current item a `surface` pill with ink text, and the clay "S" on top. In dark, put it on `ground` #101419 with a 1 px `rule` right edge and the `rail-current` pill. The list at #181c22 sits between rail and thread, so each tone still meets a different one. The owner's open question, rail or bar, still stands. This is only about its colour.
5. **Selection has three looks.** The pinned row gets a green wash. The open row gets a graphite fill and a clay bar. Picked people get one peach slab with clay names, in the colour family of my bubbles. Fix: keep the peach for picked people, since choosing is a different job. Put a 1 px `rule` between picked rows so two people read as two rows, and keep their names in `ink` rather than `on-accent-wash`. The tick box already says picked.
6. **The Direction line misstates clay.** It says clay is "what you sent", but unread badges and unread times, which are other people's messages, are the same clay. Today's indigo worked the same way, so the app isn't worse, but the sheet's headline claim is false. Fix: reword it to "clay is Satchel's one accent: my bubbles, unread counts and the one primary action". Don't add a second accent.
7. **Joined bubbles repeat the time.** Thread. "Perfect, I'll bring the bags." and "Should I get flatbread too?" both print 16:05. The 2 px gap and 6 px joined corners are right. Collapsing a repeated same-minute time onto the last bubble of a run is a common messenger pattern, but it changes today's per-bubble time, so only do it if the owner agrees.

## Strengths to keep

- The clay bubble with solid-colour meta at 5.37:1, and Claude's green kept only for the Ideas inbox. That green row is the one thing on these screens that belongs only to Satchel.
- New group as a real form. Both fields have labels above them, the people sit in a card with a 1 px hairline and radius 18, rows are 48 px targets, and there's one filled primary. It's the biggest gain over today.
- Dark is designed, not inverted. The list at #181c22 sits lighter than the thread at #101419, my bubble drops to a deeper clay so it doesn't glow, and small accents go peach.
- The phone layout is a real phone design. The active tab gets a pill, the composer is 48 px, and every row target is 48 px or more.

## Heuristic scores: 31/40, Good band (28-35)

1. Visibility of system status: 3. Ticks, "Seen", unread badges and a full states sheet, but the open chat is barely marked.
2. Match with the real world: 4. Plain messenger words, conventional layout, no metaphor.
3. User control and freedom: 3. Back arrows and Cancel exist, but Cancel doesn't look like a button.
4. Consistency and standards: 3. Three selection looks, and the clay story on the sheet doesn't match the screens.
5. Error prevention: 3. Send stays disabled until there's text, and the group form validates inline ("Give the group a name.").
6. Recognition rather than recall: 4. Labelled rail and tabs, field labels instead of placeholders.
7. Flexibility and efficiency: 2. Enter sends on desktop, but there's no chat search, and new chat is far from the thumb.
8. Aesthetic and minimalist design: 3. Calm and ordered, but the light rail outweighs the content.
9. Error recovery: 3. "Not sent. Tap to retry" and the offline toast with Try again are on the sheet.
10. Help and documentation: 3. The empty states say what to do next.

Cognitive load is low: one failure on the 8-item checklist. Minimal choices passes, with at most two actions at any decision point (Cancel and Create group, the field and Send, two rail items). Chunking fails on paper because the chat list and people list run past four items, but they're scrolling lists rather than choice sets, so I'd leave them.

Detector: run as written, `detect.mjs` reported itself DEGRADED because htmlparser2, css-select, css-tree and domutils are missing, and it returned `[]`. That's an undercount, not a clean bill. I copied the scripts into my scratch folder, pointed them at presentation-sites' node_modules and re-ran: exit 2, 5 to 9 warnings per screen twin, 26 on the Direction sheet.
- `cramped-padding` on `.sm`, `.rows`, `.people`, `.bar` and `.badge`. False positives. Full-bleed lists and a 24 px centred badge are how a messenger is built.
- `flat-type-hierarchy` (12/14/16/20, 1.7:1) on the thread and new group. Intended for app density, and titles get their weight from 700 and the bars. Not a finding.
- `nested-cards`, 22 of them, on the Direction sheet. False positive: it's a specimen sheet of components on panels.

What must not be diluted while fixing: the clay bubble on graphite with Claude's green as the only other colour, and the three surface tones that keep list, thread and bars apart.

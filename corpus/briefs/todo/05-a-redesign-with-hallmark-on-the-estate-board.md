# Task 05: A redesign with Hallmark, on the estate board

**Depends on:**

- In Satchel: [brief 03](03-the-web-app-to-tailwind.md), which puts the web app on Tailwind tokens in one `@theme`, with a named type scale and the Light / Dark / System switch. A redesign is then mostly a new token set and layout. [Brief 02](02-base-ui-by-the-conventions.md) fixes the two Base UI wrappers it restyles.
- In the owner's skills library:
  - brief 24, which vendors Hallmark as the design skill and adopts taste-skill 2.5's ideas (palettes and type dealt by trade, its copy layer);
  - the estate redesign board: one artifact with a page per app, owned by the skills library.
- The owner's answer of 2026-11-10 (Q39): no bake-off; Hallmark redesigns every web UI, keeping what is useful from taste-skill 2.5, and the owner approves each app on the board before any code changes.

**Runs before:** nothing. **Runs after:** 01 to 04, the redesign last. Brief 04 is server-only and does not block it.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)); if it is still down (since 2026-10-13), say so in the outcome note.

## Context

Satchel is a small private messenger for the owner and a few friends, with an Ideas inbox that Claude reads through a CLI. It is phone first, an installable PWA, and a conventional messenger on purpose.

### The screens (read 2026-11-10, `web/src/router.ts`)

| Screen | Route | File |
|---|---|---|
| Sign-in, the gate's loading and unreachable states | gate, before any route | `web/src/auth/LoginPage.tsx`, `web/src/auth/AuthGate.tsx` |
| Chat list (the pinned Ideas inbox, unread badges, ticks, the loading skeleton, the empty list) | `/` | `web/src/chats/ChatList.tsx`, `ChatRow.tsx` |
| Thread (bubbles, ticks, day separators, the pills, the composer) | `/c/:id` | `web/src/thread/ThreadScreen.tsx`, `web/src/layout/Tick.tsx` |
| New chat and the group form | `/new` | `web/src/people/NewChat.tsx` |
| Settings: account, sign-in methods, Notifications, Connect Claude | `/settings` | `web/src/settings/Settings.tsx`, `SignInMethods.tsx`, `Notifications.tsx`, `ConnectClaude.tsx` |
| Share target | `/share` | `web/src/share/ShareScreen.tsx` |
| The shell: bottom tab bar on a phone, the two-pane layout from 900 px, the empty pane | every route | `web/src/layout/AppShell.tsx`, `TabBar.tsx`, `ScreenHeader.tsx`, `Avatar.tsx` |

### What the design docs fix today

- [wiki/design.md](../../wiki/design.md) records the screens, the message states (the tick, "Seen", failed send), the tokens in light and dark, and the PWA. It opens with the owner's rule: familiar UI over a bold metaphor, so navigation must look like any messenger.
- [wiki/decisions.md](../../wiki/decisions.md): "Ideas inbox first, friends second", "Text only, no tags, no offline outbox", "Android first, iPhone kept working", and the Base UI decision as brief 03 revisits it.
- The glossary words ([wiki/glossary.md](../../wiki/glossary.md)) are the UI's copy.
- The theme switch is the owner's call of 2026-11-10 (Q18): Light / Dark / System, light on a first visit, built in brief 03.
- The 900 px breakpoint is `WIDE_QUERY` in `web/src/polling.ts` and `--breakpoint-wide` in the CSS, kept equal by a test.

The redesign stays inside these decisions unless the owner reopens one on the board.

## Owner decisions

Answered 2026-11-10: Q39 (Hallmark, with taste-skill 2.5's useful parts; approval on the board first). Default: the proposal keeps conventional messenger navigation (list, thread, bottom tabs, two panes from 900 px), the pinned Ideas inbox and the tick states. A metaphor or a changed navigation is flagged on the board as a reopened decision, since the owner has rejected a metaphor-led UI before.

## Files you OWN

- `web/src/styles/index.css` (the tokens and the type scale) and the screens listed above, one commit each.
- A `DESIGN.md` in `web/`, recorded from the shipped result.
- Corpus: [wiki/design.md](../../wiki/design.md), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md).

## Files you must NOT touch

- `server/`, `shared/` and `cli/`.
- The vendored Ward library in `web/vendor/`.
- The service worker and the manifest's contents, apart from colours that the new tokens change (`theme_color` stays the light accent).
- The copy's meaning: wording stays unless the board approves a change. No invented messages, names or numbers in screenshots beyond the demo seed's. Claude's token is never shown in a capture.
- Behaviour: live updates, the seen marker, the permission prompt's first-await rule, routes.

## What to do

1. **Today.** Take Playwright screenshots of every screen above at 1280 and 390 px, in light and dark, kept out of git. Use the demo seed and a frozen clock, as brief 03 does. Include the states in design.md's "Message states", the offline banner and pills, and Settings in each notification state.
2. **Propose.** With Hallmark (and taste-skill 2.5's trade palettes and copy layer where they help), make a proposal per screen, inside the recorded decisions. Check each against the Floor: contrast, a visible focus ring, a reduced-motion path, no invented facts, no broken phone layout.
3. **Board.** Put the proposals on this app's page of the estate board, beside today's screenshots at both widths.
4. **Approval.** The owner approves on the board. Nothing below starts before that, and the approval is recorded in `log.md` with its date.
5. **Build.** First as a token change in `index.css` (colours, radii, type scale, spacing, both themes), then one screen per commit. Keep the two wrappers and the theme switch working.

## Acceptance

- [ ] The owner's approval is on the board and recorded in `log.md` with the date.
- [ ] Contrast: every text and icon pair in both themes clears 4.5:1 (3:1 for large text and UI parts), measured with a script over the built tokens and listed in the outcome note, including the accent bubble's text and the ticks on it.
- [ ] A Playwright test tabs through each screen and asserts a visible focus ring on every stop.
- [ ] A Playwright test with `reducedMotion: "reduce"` asserts no running animation or transition on each screen.
- [ ] A Playwright test at 390 px asserts `document.documentElement.scrollWidth <= window.innerWidth` on each screen, and one at 899, 900 and 901 px checks the layout switch.
- [ ] Every name, message and figure shown comes from the data or the copy; the outcome note lists none invented.
- [ ] The Light / Dark / System switch still works, with light on a first visit, and the Playwright suite passes in light, dark and system.
- [ ] `npm run check` passes, and `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 03 owns the tokens, the type scale, the breakpoint and the theme switch; this brief changes their values and the layout on top. The 900 px test must keep passing.
- Brief 02's `Switch` and `Checkbox` wrappers are restyled, not replaced.
- Brief 01's formatter and lint run on every redesign commit.

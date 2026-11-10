# Task 02: Base UI by the conventions

**Depends on:**

- In Satchel: brief 01, for the gate, the formatter and `.claude/rules/web.md`.
- In the owner's skills library:
  - brief 02, *A base-ui skill, styled with Tailwind*: rules 1-13, the references and `check-base-ui.mjs`;
  - brief 15, *Enforce the base-ui and code-structure skills in every repo*: the checker runs `--warn-only` until brief 03 here is done.
- The owner's grilling of 2026-11-10: Q15 (Base UI only under `ui/`) and Q16 (where native controls stay), plus the two new questions below.

**Runs before:** 03. This brief changes structure; brief 03 then changes only the styling, so its before and after screenshots compare like with like.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)); if it is still down (since 2026-10-13), say so in the outcome note.

## Context

The owner's call of 2026-11-09 is Base UI everywhere at 1.9.0, with the base-ui skill's conventions enforced in each repo. Satchel adopted Base UI on 2026-10-23 for two controls ([wiki/decisions.md](../../wiki/decisions.md), "Base UI for interactive controls, styled by our own CSS"). It is small and close: no native dialogs, subpath imports, an exact pin. This brief closes the one structural gap the audit found and records what it left alone. It does not move styling to Tailwind; that is brief 03.

### The pin (verified 2026-11-10)

- `web/package.json:60` pins `"@base-ui/react": "1.9.0"` exactly. No other `package.json` (root, `server`, `shared`, `cli`) declares it.
- `package-lock.json` resolves `node_modules/@base-ui/react` at 1.9.0, with `@base-ui/utils` 0.5.0, and `npm view @base-ui/react dist-tags` says `latest` is 1.9.0.
- `grep -rn "OTPFieldPreview\|otp-field\|sanitizeValue"` over the repo, outside `node_modules`, finds nothing.

**No bump brief is needed.**

### The audit against rules 1-13 (2026-11-10)

Base UI is imported in two files (`grep -rn "@base-ui/react" web/src`), both subpaths.

| Rule | Violations | Where |
|---|---|---|
| 1. Exact pin | 0 | |
| 2. Subpath imports, no root barrel | 0 | `web/src/settings/Notifications.tsx:1` (`/switch`), `web/src/people/NewChat.tsx:1` (`/checkbox`). |
| 3. Base UI only under a `ui/` folder | **2** | Both files above, used directly. There is no `web/src/components/` folder: shared pieces live in `web/src/layout/` (`Avatar`, `Link`, `ScreenHeader`, `TabBar`, `Tick`, `icons`). |
| 4. Tailwind on the parts, no class selector aimed at a part | **5 selectors** | `web/src/push/notifications.css:51, 56, 60` (`.switch[data-checked]`, `.switch[data-checked] .switch__thumb`, `.switch[data-disabled]`) and `web/src/people/people.css:84, 89` (`.person__check[data-checked]`, `[data-disabled]`). **Brief 03's work.** |
| 5-7. One stylesheet, semantic tokens, motion | all of them | **Brief 03's work.** Two transitions on the switch (`web/src/push/notifications.css:36, 48`) are the only motion tied to a Base UI part. |
| 8. Floating parts portalled | n/a | Satchel has no popover, menu, tooltip or dialog. |
| 9. A trigger around a component uses `render` | n/a | No triggers. |
| 10. `Select.Root` with `items` | n/a | No `Select`, no `<select>`. |
| 11. No `window.confirm`, `alert` or `prompt` | 0 | `grep -rnE "window\.(confirm\|alert\|prompt)\|\bconfirm\(" web/src` finds nothing. |
| 12. Dialogs | n/a | No dialog. |
| 13. Base UI over hand-built widgets | **0 required, 2 to decide** | See below. |

**Rule 13's two to decide.** Both are an inline two-step confirm: the action button turns into a red "confirm" button and a "Cancel", in the same row.

1. **Revoke a Claude token**, `web/src/settings/ConnectClaude.tsx:187-205`: `confirming` holds the token id (line 43), and "Confirm revoke" is `button--danger`.
2. **Unlink Ward**, `web/src/settings/SignInMethods.tsx:172-192`: a `confirming` boolean (line 159), and "Unlink Ward" turns into a danger button with a "Cancel".

Rule 13 lists a menu, dialog, popover, switch, checkbox, tabs, toast and slider. An inline confirm is none of those, so the rule does not require a change. The skill's `confirm` pattern is an `AlertDialog` with a pending state, which is a visible redesign of two settings rows. Decision 2.

**Considered and left:**

- **Native by rule 13:** the text and search inputs (`NewChat.tsx:105-123`, `LoginPage.tsx:62, 78`, `SignInMethods.tsx:66`), the composer's `<textarea>` (`web/src/thread/Composer.tsx:55`), and the buttons.
- **Not tabs:** `web/src/layout/TabBar.tsx` is a `<nav>` of two links that set `aria-current="page"`. They are routes, so Base UI `Tabs` would be the wrong semantics.
- **Not toasts:** the `role="status"` lines (`ConnectClaude.tsx:158`, `NewChat.tsx:94`) are inline text next to what they report.
- **Field and Input:** Base UI's `Field` would take over the hand-built `.field` label and input in `NewChat.tsx` and `LoginPage.tsx`. Rule 13 keeps text inputs native, so it is not in this brief.

### What the wrappers must keep

The static-markup tests assert on the markup Base UI produces, so the wrappers pass props through unchanged. `web/src/settings/Notifications.test.ts` asserts:

- `role="switch"` and its absence in the non-ready states (lines 27, 35, 46);
- `aria-checked="false"` and `"true"` (47, 50), `checked=""` (51) and `disabled=""` (55, 60).

Neither file has a class-name assertion (`grep -n "className\|class=" web/src/**/*.test.ts` finds none), so the move breaks no test by itself.

## Owner decisions (defaults this brief builds)

1. **Base UI only under `ui/`** (Q15). Default: yes. A new `web/src/components/ui/` holds a `Switch.tsx` and a `Checkbox.tsx`, and the two feature files import them. The folder name follows the skill; the alternative is `web/src/layout/ui/`, to sit beside the existing shared pieces. Nothing else changes.
2. **The two inline confirms.** Default: they stay as they are, and `scripts/conventions.json` records nothing for them, because no rule flags them. The alternative is the skill's `ConfirmDialog` (an `AlertDialog` that cannot be dismissed while its action runs, with a "Revoking…" or "Unlinking…" label). *New question for the grilling:* does the owner want that redesign in the estate's apps, or is an inline confirm on a settings row fine? The answer applies to any app with the same pattern.
3. **Native controls** (Q16). Default: text inputs, the textarea and buttons stay native, as listed.
4. **The `Switch` and `Checkbox` wrappers' API.** Default: the wrapper takes Base UI's own props (`checked`, `onCheckedChange`, `disabled`, the ARIA props) and a `className`, and renders the part markup itself (`Switch.Root` with `Switch.Thumb`, `Checkbox.Root` with `Checkbox.Indicator`). Callers pass no part class names. Brief 03 puts the Tailwind classes inside the wrappers, so the call sites stay free of styling.

## The wrapper set: `web/src/components/ui/`

| File | What it is | From |
|---|---|---|
| `Switch.tsx` | Base UI `Switch`: `Switch.Root` and `Switch.Thumb`; props `checked`, `onCheckedChange`, `disabled`, `aria-describedby` | `web/src/settings/Notifications.tsx:90-98` |
| `Checkbox.tsx` | Base UI `Checkbox`: `Checkbox.Root` and `Checkbox.Indicator`, holding the `CheckIcon`; props `checked`, `onCheckedChange`, `disabled` | `web/src/people/NewChat.tsx:146-155` |

`CheckIcon` lives in `web/src/layout/icons.tsx`; the wrapper imports it, so `ui/` depends on `layout/` and not the other way round.

## Files you OWN

- `web/src/components/ui/**` (new), and the two imports in `web/src/settings/Notifications.tsx` and `web/src/people/NewChat.tsx`.
- The CSS rules for the markup this brief moves: rename `.switch*` and `.person__check*` to the wrapper's own classes; don't restyle. Brief 03 turns them into utilities.
- `web/src/settings/Notifications.test.ts`, only if an assertion needs the wrapper's path (none should).
- A test for each wrapper (below).
- Corpus:
  - [wiki/design.md](../../wiki/design.md): one line saying where the wrappers live;
  - [wiki/decisions.md](../../wiki/decisions.md): the "Base UI for interactive controls" entry gains the 2026-11-09 conventions line;
  - [wiki/status.md](../../wiki/status.md);
  - [log.md](../../log.md).

## Files you must NOT touch

- `server/`, `shared/`, `cli/`, and `web/package.json`. Every part needed ships in `@base-ui/react` 1.9.0, so no new dependency.
- Styling beyond renaming a rule's selector. No Tailwind here.
- The behaviour of `Notifications` and `NewChat`: the permission prompt's first-await rule, the group-size cap (`GROUP_MEMBERS_MAX`, `disabled={!checked && atMax}`), the `<label>` wrapping each control.
- The two inline confirms (decision 2).

## What to do

One commit per numbered step. After each, `npm run check` passes, with `check-base-ui` `--warn-only`.

1. **Before.**
   - Run `check-base-ui` strict and record the counts by rule. Expect rule 3 at 2, and rules 4-6 at whatever the checker counts for the CSS.
   - Take screenshots, at 1280 and 390 px, light and dark, of Settings → Notifications (off, on, blocked) and the New group list (none picked, two picked, at the cap). Brief 03's method has the bring-up; keep them out of git.
2. **`Switch.tsx`.** Move the switch out of `Notifications.tsx`, with the same props and the `<label>` kept in the caller. Add a test that renders it with `renderToStaticMarkup` and asserts `role="switch"`, `aria-checked` and `disabled`. Rule 3 drops to 1.
3. **`Checkbox.tsx`.** Move the checkbox out of `NewChat.tsx`, with the indicator and icon. Add the same kind of test (`role="checkbox"`, `aria-checked`). Rule 3 reaches 0.
4. **After.**
   - Take the screenshots again. List every difference with its reason; expect none.
   - Run `check-base-ui` strict: rules 1-3 and 9-11 report 0.
   - Update [wiki/design.md](../../wiki/design.md), [wiki/decisions.md](../../wiki/decisions.md), [wiki/status.md](../../wiki/status.md) and [log.md](../../log.md), and run `bash corpus/lint.sh`.

## Acceptance

- [ ] `grep -rn "@base-ui/react" web/src --include=*.tsx --include=*.ts | grep -v "components/ui/"` prints nothing.
- [ ] `check-base-ui` strict reports 0 for rules 1, 2, 3, 9, 10 and 11. Rules 4-7 are left for brief 03, and their counts are in the outcome note.
- [ ] `npx vitest run web/src/settings/Notifications.test.ts` passes unchanged, and each wrapper has its own test.
- [ ] The before and after screenshots match, with any difference listed and explained.
- [ ] The outcome note says what was decided about the two inline confirms (decision 2).
- [ ] `npm run check` passes, and `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 03 styles `web/src/components/ui/` with Tailwind on the parts, and removes the CSS rules this brief renamed.
- If the owner picks the `ConfirmDialog` branch of decision 2, it becomes a third wrapper here: `AlertDialog` with a pending label, and both rows move onto it before brief 03.
- The skills library's `check-base-ui` rule 13 has no check for hand-built confirms; the two here are a case for it to say so.

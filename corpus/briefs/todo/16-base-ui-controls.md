# Task 16: Base UI for the notifications switch and the group picker

## Context

On 2026-10-23 the owner asked for Base UI (`@base-ui/react`) in the apps that
still hand-build their interactive widgets, to match their other apps
(atrium, imbatranimOS, sports-app, trips, ro-housing, public-resource-map,
newspapper). Base UI is headless: it supplies the keyboard behaviour and
ARIA, and Satchel keeps its own CSS and tokens.

Satchel has almost no hand-built widgets. There are two controls:

- `web/src/settings/Notifications.tsx`: the "Notify this device" switch, a
  native checkbox with `role="switch"`, drawn as a switch by `.switch` in
  `web/src/push/notifications.css`.
- `web/src/people/NewChat.tsx`: in group mode, each person row is a
  `<label>` holding a native checkbox. Rows past the member limit are
  disabled.

The pattern to copy is `../newspapper/ui/src/components/ui/Toggle.tsx`
(Base UI with the app's own stylesheet).

## Files you OWN

```
web/src/settings/Notifications.tsx  web/src/settings/Notifications.test.ts
web/src/people/NewChat.tsx  web/src/people/people.css
web/src/push/notifications.css  web/package.json (dependencies only)
package-lock.json  corpus/wiki/{decisions,status}.md
```

## Files you must NOT touch

`shared/`, `server/`, `web/src/push/*.ts` (the subscription logic), `sw.ts`.

## What to do

1. Add `"@base-ui/react": "1.9.0"` to `web/package.json` dependencies,
   pinned exactly like the rest, then run `npm install` from the root.
2. **Switch.** Replace the input with `Switch.Root` + `Switch.Thumb`. Keep
   `checked`, `disabled` (busy, or permission denied), `aria-describedby`
   pointing at the hint, and `onCheckedChange` → `onToggle`. Keep the
   `<label>` wrapping so clicking the text toggles. Restyle `.switch` onto the
   root and thumb with `data-checked`/`data-disabled`, keeping the current
   look and the 44 px target.
3. **Group picker.** Replace each row's input with `Checkbox.Root` +
   `Checkbox.Indicator`, and keep the disabled-past-the-limit rule. A
   `CheckboxGroup` around the list is fine if it simplifies `picked`, but it's
   not required.
4. Update `Notifications.test.ts` if it asserts on the old markup. Assert on
   roles and states, not on class names.
5. Add a `decisions.md` entry: Base UI for interactive controls, dated
   2026-10-23, the owner's call to match their other apps. Rejected: native
   inputs styled by hand, and shadcn (it brings Tailwind). Update `status.md`.

## Acceptance

- `npm run typecheck && npm run lint && npm run test && npm run build` pass.
- Browser check against the dev server at 390 px and 1440 px:
  - the switch toggles by click, by clicking its text, and by Space;
  - a screen-reader name and state show in the accessibility tree
    (`switch`, "checked"/"not checked");
  - while busy it can't be toggled;
  - in New group, rows tick by click and by Space, and the limit disables
    the rest.
  Take before/after screenshots. They should look the same.
- `bash corpus/lint.sh` passes.

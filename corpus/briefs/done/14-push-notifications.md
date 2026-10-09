# Task 14: Push notifications

## Context

With friends on Satchel, a message should reach a closed app. This brief
adds Web Push: subscriptions per device, a notification for every message
from someone else, and a Notifications switch in Settings.

On iPhone, web push works only for an app added to the Home Screen; Android
has no such step (see [open-questions.md](../../wiki/open-questions.md)). The
switch must explain that rather than fail silently. Claude never sends
messages, so the inbox produces no notifications.

## Files you OWN

```
shared/src/api.ts   (push routes, additions only)
server/package.json   (add web-push)
server/src/db/migrations.ts   (the push migration)
server/src/store.ts  server/src/store.test.ts   (push additions)
server/src/push/*  server/src/routes/push.ts  server/src/app.ts   (register push)
server/src/routes/conversations.ts   (send after a stored message)
server/src/config.ts   (VAPID settings)
web/src/push/*  web/src/settings/Notifications.tsx  web/src/sw.ts   (push handlers)
web/vite.config.ts   (only if the service worker strategy must change)
.env.example
../vps-deploy/stacks/satchel.ts   (pass the VAPID settings into the container)
```

## Files you must NOT touch

`cli/`, `corpus/`, `server/src/ward/`, `../vps-deploy/secrets/`.

## What to do

1. **Keys.** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`
   (`mailto:johndoe@example.com`, the estate's placeholder contact) from the
   environment. Without them the server starts with push disabled and logs it
   once. Document generating a pair (`npx web-push generate-vapid-keys`) in
   the README; the owner puts them in `.env` locally and in
   `../vps-deploy/secrets/satchel.env` for production. Never commit a key.
2. **Storage.** A migration adding `push_subs` (`endpoint` unique, `subject`,
   `p256dh`, `auth`, `created_at`, `last_success_at`). Store functions to
   save (upsert by endpoint), delete, and list a member's subscriptions.
3. **Routes**, Ward auth: `GET /api/push/key` → `{ publicKey }` or 404 when
   disabled; `POST /api/push/subscriptions` with the browser's subscription
   JSON; `DELETE /api/push/subscriptions` with `{ endpoint }`.
4. **Sending.** After a message is stored and the response sent, notify
   every member except the sender: payload `{ conversationId, title, body }`
   where title is the sender's name (or "Sender in Group"), body is the first
   120 characters, TTL 24 hours, urgency normal. A 404 or 410 deletes the
   subscription. Other failures are logged and never retried. A failure
   never affects the message request.
5. **Service worker.** On `push`, show the notification with
   `tag: conversationId` (one notification per chat, replaced by the
   newest), unless a focused window already shows that conversation. On
   `notificationclick`, focus an open window and navigate it to
   `/satchel/c/<id>`, or open one.
6. **Settings → Notifications.** A switch that asks for permission only when
   turned on. Denied permission says how to re-enable it in the browser. On
   iOS outside standalone mode: "Add Satchel to your Home Screen first
   (Share → Add to Home Screen), then turn this on there." Turning it off
   unsubscribes and deletes the subscription on the server.
7. **vps-deploy.** Pass the three VAPID values from `../vps-deploy/secrets/satchel.env`
   into the container environment the way the stack passes other secrets.
   Write the redeploy command into the README; deploying is an owner step.

## Acceptance

- Server tests with web-push stubbed: a message notifies the other members'
  subscriptions and not the sender's; a 410 removes the subscription; a send
  failure still returns 201 for the message; push disabled without keys.
- In Chrome locally with real keys: turn notifications on, close the tab,
  send a message from a second account, see one notification; click it and
  land in that chat.
- `npm run typecheck && npm run lint && npm test` pass. No key in the repo.

## Outcome (2026-10-09)

Done. Satchel commit `35c53ea` and vps-deploy commit `fe6d6f3`, with 97 new
tests (497 in the suite). The run was interrupted by a session end and
resumed.

- **Pins.** web-push 3.6.7, the latest release (2024). The controller
  declared `workbox-precaching` and `workbox-routing` 7.4.1 in the web
  package, since the service worker imports them directly.
- **Storage.** Migration 3 adds `push_subs`: an endpoint upserted on save
  moves to the account saving it, and an account keeps at most ten.
- **Config.** VAPID settings are checked as a real pair, and push is off
  unless all three are set.
- **Endpoints** must be public https push services: no IP addresses,
  localhost, single-label or internal names.
- **Sending** happens after the reply and only for newly stored messages,
  to every member except the sender and Claude. 404 and 410 delete the
  subscription.
- **Service worker.** The worker moved to injectManifest, keeping the same
  19 precache entries and no runtime caching. A push is suppressed while
  the chat is focused.
- **Settings.** Notifications sits above Connect Claude, because everyone
  sees it.
- **Live round-trip** in headless Chrome through FCM: subscribe, one
  notification with the tab closed, suppression while focused, replacement
  by tag, unsubscribe. Not tested live: `notificationclick` and iOS.

Concerns:

- Safari may penalise pushes suppressed while focused.
- A shared browser keeps the previous account's pushes until someone opens
  Settings.
- After a VAPID key change, old rows stay until their devices turn
  notifications back on.

# Brief 15: Served at the root of satchel.<domain>

## Context

On 2026-10-22 the owner asked for Satchel on its own subdomain,
`satchel.<domain>`, with the imbatranimOS desktop, Postern and Ward. Satchel
holds friend chats and the Ideas inbox, and on the shared origin a script in any
estate app could read them with the session cookie attached. The routing is
`../vps-deploy` brief 16: the client at the root of the host, built with
`SATCHEL_BASE=/`, and the API at `/satchel-api` on the same host. Satchel was
never deployed, so there is no redirect from `/satchel`.

The base is already a build setting (`SATCHEL_BASE`, default `/satchel/`), and
the worker's scope, the manifest and the router derive from it, so the app
needs no code change for the move. What does change:

- the CLI's default URL, `DEFAULT_URL` in `cli/src/config.ts`;
- the owner's setup steps in `docs/owner-setup.md`: Ward's console is on
  `ward.<domain>`, and the two addresses registered for the client are on
  `satchel.<domain>`.

## What to do

1. `DEFAULT_URL` to `https://satchel.<domain>/satchel-api`, with its test.
2. Check that a build with `SATCHEL_BASE=/` emits `/` for the base, the
   manifest and the worker, and that the worker keeps off `/satchel-api` now
   that its scope covers the whole host (the navigation denylist).
3. Rewrite the first-deploy steps in `docs/owner-setup.md` for the new host.
   Drop the step that redeployed Ward's UI for its login allowlist: Ward
   retired that allowlist on 2026-10-13 (its brief 30).
4. Record the call in `decisions.md`, and update the architecture, design,
   Claude-access and status pages.

## Acceptance

- Typecheck, lint and the tests pass.
- A production build has `/` as its base, manifest scope and start URL, and
  names `/satchel/` nowhere.

## Outcome (2026-10-22)

Done. The CLI defaults to `https://satchel.gandolh.ro/satchel-api`. A build
with `SATCHEL_BASE=/` loads from `/assets/`, its manifest's `id`, `scope` and
`start_url` are `/`, and neither `index.html` nor `sw.js` names `/satchel/`;
the worker's navigation denylist already excluded `/satchel-api`, and its
comment now says the API is inside the scope. Local dev stays under
`/satchel/`. Typecheck, lint and all 536 tests pass. The owner's steps are in
`docs/owner-setup.md`: register the client at `https://ward.<domain>/console`
with the redirect URI `https://satchel.<domain>/satchel-api/auth/ward/callback`
and the sign-out return URI `https://satchel.<domain>/`, store the client key,
then `node cli.ts satchel all`. brief-board is down, so nothing was posted
there.

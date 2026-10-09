# Owner setup

Everything the owner does by hand: the first deploy, connecting Claude,
push notifications and inviting friends. These were the README's "Owner
setup", "Push notifications" and "Inviting a friend" sections until
2026-10-09; the steps are unchanged. Local development is in
[getting-started.md](getting-started.md).

## First deploy and Claude

Everything here is done by hand, in this order. Nothing in the repo deploys or
writes a secret for you. Commands run on your machine; the deploy builds the
API image on the VPS.

1. **Register Satchel in production Ward.** Open
   <https://gandolh.ro/ward/console> and sign in as the break-glass superuser.
   Create an app with slug `satchel` and name `Satchel`, with public
   registration closed. On the app's page, issue a service key under "Service
   keys" (it is shown once; copy it now). Then grant your own account the
   `admin` role on `satchel`.

2. **Store the key.** Put it in vps-deploy's secrets, as one line:

   ```
   WARD_APP_KEY=<the service key>
   ```

   in `~/projects/vps-deploy/secrets/satchel.env` (`chmod 600` it). The deploy
   writes it into the container's environment next to `WARD_PUBLIC_ORIGIN` and
   `WARD_API_BASE_PATH`.

3. **Redeploy Ward's UI,** so its login allowlist knows `/satchel/`:

   ```
   cd ~/projects/vps-deploy && node cli.ts ward deploy
   ```

4. **First deploy of Satchel** (builds the web app, ships it, builds and starts
   the API container):

   ```
   cd ~/projects/vps-deploy && node cli.ts satchel all
   ```

5. **Install it on the phone.** Open <https://gandolh.ro/satchel/>, sign in,
   then Add to Home Screen.

6. **Create a Claude token.** In the app: Settings, Connect Claude, Create
   token. Copy it (shown once) and write it to the CLI's config file:

   ```
   mkdir -p ~/.config/satchel && umask 077 && read -rs -p 'Claude token: ' T && printf 'SATCHEL_TOKEN=%s\n' "$T" > ~/.config/satchel/env && unset T
   ```

   Run this yourself in a terminal, not through Claude, so the token stays out
   of shell history and transcripts.

   The file may also set `SATCHEL_URL`; it defaults to
   `https://gandolh.ro/satchel-api`.

7. **Install the CLI.**

   ```
   cd ~/projects/satchel && npm install && npm run build
   cd cli && npm link
   satchel --version
   satchel unread
   ```

   `satchel unread` works from any directory. Exit codes: 0 success, 1 usage
   error (including no token), 2 Satchel rejected the call (for example a
   revoked token), 3 Satchel isn't reachable.

8. **Tell Claude about it.** Add this line to `~/.claude/CLAUDE.md`:

   > When the owner asks to check the inbox (or "my ideas", "Satchel"), run `satchel guide` and follow it.

9. **Try it.** Write a message on the phone, then say "check my inbox" in
   Claude Code.

Later updates:

```
cd ~/projects/vps-deploy
node cli.ts satchel deploy   # the web app
node cli.ts satchel server   # the API container
```

To run the API container on your machine instead, see
[getting-started.md](getting-started.md#run-the-api-container).

## Push notifications

Satchel can notify a phone or computer when someone else writes to you, with
the app closed. The server signs every push with a VAPID key pair. Without
the pair it starts with push off and says so once in its log; everything else
works as before.

1. **Make a pair,** once, on your machine:

   ```
   npx web-push generate-vapid-keys
   ```

   It prints a public key and a private key. The private key is a secret:
   keep it out of the repo, out of chats and out of shell history.

2. **Local development.** Add three lines to the repo's `.env` (git-ignored):

   ```
   VAPID_PUBLIC_KEY=<public key>
   VAPID_PRIVATE_KEY=<private key>
   VAPID_SUBJECT=mailto:johndoe@example.com
   ```

   `npm run dev` runs no service worker, so try push on the built app:
   `npm run build`, then `npm run dev -w @satchel/server` and
   `npm run preview -w @satchel/web`, and open
   <http://localhost:4175/satchel/>. For the local container, copy the same
   lines into `infrastructure/.env`.

3. **Production.** Add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` to
   `~/projects/vps-deploy/secrets/satchel.env`, next to `WARD_APP_KEY`.
   `VAPID_SUBJECT` defaults to `mailto:johndoe@example.com` there; set it too
   if you want a different contact. Then redeploy:

   ```
   cd ~/projects/vps-deploy && node cli.ts satchel all
   ```

   `all` runs `server` (restarts the API with the keys) and `deploy` (ships
   the web app with its new service worker); you can run the two separately.

4. **Turn it on, per device:** Settings, Notifications. On an iPhone, web
   push works only in the Home Screen app (iOS 16.4 or later): open
   <https://gandolh.ro/satchel/> in Safari, Share → Add to Home Screen, open
   Satchel from the Home Screen icon, and turn Notifications on there.
   Android and desktop browsers need no such step.

Keep the pair. If you ever replace it, every device shows Notifications as off
and has to turn it on again.

## Inviting a friend

Friends sign in with Ward, the same as you. Satchel lets in any account with a
role on `satchel`, and the role decides what the account gets. All of this is
done by hand in production Ward's console, <https://gandolh.ro/ward/console>.

1. **Give them an account.** Under Accounts, use "New account" with a username
   and a password, and pass the password on yourself. An account made there
   has no email address, so it has no reset link.

   Or let them sign up: on Satchel's page under Apps, use "Open
   registration…" with the baseline role `member`. Anyone who finds the
   sign-up page then becomes a friend in Satchel, so close registration again
   once they're in.

2. **Grant `member` on `satchel`.** On the account's page, pick the app
   `satchel`, type the role `member`, and press "Add role". An account that
   signed up through Satchel's registration already has it.

   Never grant `admin`. That role marks the owner: an `admin` account gets an
   Ideas inbox and can create Claude tokens. A `member` gets neither.

3. **They sign in once** at <https://gandolh.ro/satchel/>. After that first
   sign-in they appear in the people list (`GET /api/people`), and anyone can
   start a one-to-one chat or a group with them.

Removing their role on `satchel` in Ward locks them out at their next request
to Satchel. That request gets a 403, and Satchel then revokes any Claude
tokens the account made, deletes the push subscriptions of all its devices,
and hides it from the people list, so nobody can start a new chat or group
with them. Chats they're already in stay, messages included; the others can
still write there, and no notification goes to the person who was removed.
Granting the role again lets them back in at their next sign-in: they're in
the people list again, and notifications resume once their browser saves its
subscription again, which it does the next time Satchel opens.

Satchel only learns of the removal from that next request. Until they make
one, nothing changes: their devices still get notifications with message
previews, and keep getting them if they never open Satchel again. A tab that
is already open keeps its live connection, and new messages over it, until
its access token expires, at most 15 minutes. If nothing else that tab does
has locked them out by then, its reconnect does.

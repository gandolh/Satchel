# Owner setup

Everything the owner does by hand: the first deploy, connecting Claude,
push notifications and inviting friends. These were the README's "Owner
setup", "Push notifications" and "Inviting a friend" sections until
2026-10-09. The sign-in steps changed on 2026-10-13 to local accounts plus "Sign in with Ward". Local development is in
[getting-started.md](getting-started.md).

## First deploy and Claude

Everything here is done by hand, in this order. Nothing in the repo deploys or
writes a secret for you. Commands run on your machine; the deploy builds the
API image on the VPS.

1. **Register Satchel as a client in production Ward.** Open
   `/ward/console` on the production site and sign in as the break-glass superuser.
   Create an app with slug `satchel` and name `Satchel`, with public
   registration closed. On the app's page, under "Sign in with Ward", register
   a client: the redirect URI is `<production origin>/satchel-api/auth/ward/callback`
   and the sign-out return URI is `<production origin>/satchel/`. Make the
   client's key pair with `npm run oidc-client-key --workspace=api -- satchel`
   from Ward's repo root, register the public half in the console, and keep the
   private half for the next step. Then grant your own account the `admin`
   role on `satchel`, so Ward lets it sign in.

2. **Store the settings.** Put them in vps-deploy's secrets, one per line:

   ```
   PUBLIC_ORIGIN=<production origin, no path>
   WARD_OIDC_ISSUER=<production origin>/ward-api/oidc
   WARD_OIDC_CLIENT_ID=satchel
   WARD_OIDC_CLIENT_KEY=<the private key, base64url>
   WARD_OIDC_REDIRECT_URI=<production origin>/satchel-api/auth/ward/callback
   WARD_OIDC_POST_LOGOUT_REDIRECT_URI=<production origin>/satchel/
   ```

   in `~/projects/vps-deploy/secrets/satchel.env` (`chmod 600` it). The deploy
   writes them into the container's environment. Satchel also runs on local
   accounts, so Ward is optional: leave `WARD_OIDC_ISSUER` out and there is no
   Ward button. Behind Caddy, also set `AUTH_TRUSTED_PROXIES` to the address
   range the container sees Caddy at, so the sign-in lockout counts real
   client addresses. Make your own account too, with `SEED_ROLE=admin` (see
   [getting-started.md](getting-started.md#create-a-user)).

3. **Redeploy Ward's UI,** so its login allowlist knows `/satchel/`:

   ```
   cd ~/projects/vps-deploy && node cli.ts ward deploy
   ```

4. **First deploy of Satchel** (builds the web app, ships it, builds and starts
   the API container):

   ```
   cd ~/projects/vps-deploy && node cli.ts satchel all
   ```

5. **Install it on the phone.** Open `/satchel/` on the production site, sign in,
   then Add to Home Screen.

6. **Create a Claude token.** In the app: Settings, Connect Claude, Create
   token. Copy it (shown once) and write it to the CLI's config file:

   ```
   mkdir -p ~/.config/satchel && umask 077 && read -rs -p 'Claude token: ' T && printf 'SATCHEL_TOKEN=%s\n' "$T" > ~/.config/satchel/env && unset T
   ```

   Run this yourself in a terminal, not through Claude, so the token stays out
   of shell history and transcripts.

   The file may also set `SATCHEL_URL`; it defaults to
   the production `/satchel-api`.

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
   `~/projects/vps-deploy/secrets/satchel.env`, next to the Ward settings.
   `VAPID_SUBJECT` defaults to `mailto:johndoe@example.com` there; set it too
   if you want a different contact. Then redeploy:

   ```
   cd ~/projects/vps-deploy && node cli.ts satchel all
   ```

   `all` runs `server` (restarts the API with the keys) and `deploy` (ships
   the web app with its new service worker); you can run the two separately.

4. **Turn it on, per device:** Settings, Notifications. On an iPhone, web
   push works only in the Home Screen app (iOS 16.4 or later): open
   `/satchel/` on the production site in Safari, Share → Add to Home Screen, open
   Satchel from the Home Screen icon, and turn Notifications on there.
   Android and desktop browsers need no such step.

Keep the pair. If you ever replace it, every device shows Notifications as off
and has to turn it on again.

## Inviting a friend

A friend is a local account with the `member` role. Satchel has no register
page, so you make the account, and role changes happen in Satchel.

1. **Give them an account.** Run the seed script with `SEED_ROLE=member`, on
   the server for production or on your machine for local, and pass the
   password on yourself (see [getting-started.md](getting-started.md#create-a-user)).
   The account has no email address, so it has no reset link.

   Never make a friend `admin`. That role marks the owner: an `admin` account
   gets an Ideas inbox and can create Claude tokens. A `member` gets neither.

2. **They sign in** at `/satchel/` on the production site with that username and
   password. After the first sign-in they appear in the people list
   (`GET /api/people`), and anyone can start a one-to-one chat or a group with
   them.

3. **Optionally, link Ward.** In Settings, a signed-in person can link their
   Ward account and then use "Sign in with Ward". Ward's own grant on `satchel`
   still decides whether Ward lets them through. Unlinking needs a local
   password first.

`Accounts.setRole` changes a role later. A user who is not an `admin` has any
Claude tokens revoked the next time they make a request.

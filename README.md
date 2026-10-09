# Satchel

Satchel is a small messenger for the owner and a few friends, with an Ideas inbox that Claude can write to through the `satchel` command. Sign-in is handled by Ward.

## Run it locally

```
npm install
npm run dev
```

Then open <http://localhost:5175/satchel/>. The API listens on port 8807; copy `.env.example` to `.env` and fill the Ward values from Ward's local `seed.mjs`.

## Owner setup

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
   mkdir -p ~/.config/satchel && umask 077 && printf 'SATCHEL_TOKEN=%s\n' '<paste>' > ~/.config/satchel/env
   ```

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

To run the API container locally, copy the Ward values from `.env` to
`infrastructure/.env` (git-ignored) and run
`docker compose -f infrastructure/docker-compose.yml up --build -d`; it listens
on `127.0.0.1:8795` and keeps its data in `./data`.

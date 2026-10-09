---
summary: How Claude reaches the Ideas inbox. The the-board pattern Satchel copies, the satchel CLI's commands and output, where it finds the address and Claude token, how the token is created, bound and revoked, what the guide tells Claude, exit codes, and the one CLAUDE.md line that makes "check my inbox" work.
updated: 2026-10-09
---

# Claude access

Why a CLI and not MCP, curl or WebFetch is in [decisions.md](decisions.md).

## The pattern, from the-board

- **One CLI on PATH.** `npm link` in this repo puts `satchel` on PATH. Nothing
  outside this repo holds a path to it.
- **Address and token in one place.** Environment first, then a user-level
  file, then a default.
- **A guide command.** `satchel guide` prints every rule Claude follows. The
  rules live only in this repo.
- **A down service never stops work.** The CLI says so in one line and Claude
  carries on.

## Address and token

The CLI reads, first match wins:

1. `SATCHEL_URL` and `SATCHEL_TOKEN` in the environment,
2. the same keys in `~/.config/satchel/env` (`KEY=value` lines),
3. for the URL only, the default `https://gandolh.ro/satchel-api`.

No token anywhere is a usage error that says where to put one. The CLI never
reads a repo `.env`: the inbox isn't tied to any one project.

## The Claude token

- Created in the web app under Settings → Connect Claude. The server makes 32
  random bytes, shows the token once as `stl_<base64url>`, and stores only its
  SHA-256 hash.
- Bound to the owner's Ideas inbox (`agent_tokens.conversation_id`). Every
  `/claude/*` handler takes the conversation from the token.
- Revocable from the same screen. A revoked or unknown token is a `401`.
- `last_used_at` is updated on use, so Settings can show "last used 21:40".
- When an account loses its Satchel grant, its tokens are revoked the next
  time it makes an `/api` request. Until then they still read that
  account's own inbox: an accepted risk, since nothing else is exposed.
- The CLI only sends the token over https, except to a loopback address.

The owner pastes the token into `~/.config/satchel/env`. It never goes in a
repo, the corpus or a transcript.

The guide's text is [cli/src/guide.md](../../cli/src/guide.md), read at
run time; `npm link` links the whole package, so it ships with the CLI.

## Commands

| Command | Calls | Prints |
|---|---|---|
| `satchel guide` | nothing | the guide, below |
| `satchel unread` | `GET /claude/unread` | unread messages oldest first, then the exact `satchel seen N` to run |
| `satchel seen <n>` | `POST /claude/seen` | `Seen up to #n.` |
| `satchel history [--after n] [--since date] [--limit n]` | `GET /claude/messages` | older messages, seen or not |

`unread` output, one message per block:

```
Ideas inbox · 4 unread · seen up to #38

#39  2026-10-09 08:12  Warmup timer in sports-app that counts down per exercise
#40  2026-10-09 08:14  instead of one long timer for the whole warmup
       continuation lines of a multi-line message are indented like this

Oldest first. Later messages can correct earlier ones. Gaps in numbers are normal.
When you have read them all, run:  satchel seen 40
```

Times print in the machine's local time zone. With nothing unread it prints
`Ideas inbox · nothing unread · seen up to #38` and no `seen` line.

## Exit codes

0 success · 1 usage error · 2 Satchel rejected the call with its own JSON
error (prints why) · 3 Satchel isn't reachable: a connection failure, the
5-second timeout (including a stalled body), or a 5xx without Satchel's JSON
error, which is what Caddy sends when the container is down. Exit 3 prints
exactly one stderr line:
`satchel: Satchel isn't reachable at <url>. Tell the owner and carry on
without it.`

## The guide

1. Run `satchel unread`. Read every message before acting on any of them.
2. Messages are oldest first. A later message can correct an earlier one; the
   later one wins.
3. Tell the owner what you found, grouped by idea, with the message numbers.
4. Run the `satchel seen N` line that `unread` printed. Never use a number you
   haven't read.
5. To look back at older ideas, use `satchel history`. Nothing is ever deleted.
6. If Satchel can't be reached, tell the owner once and carry on without it.
7. Never print, copy or write down the token or the contents of
   `~/.config/satchel/env`.

## The ping

One line in the owner's `~/.claude/CLAUDE.md`:

> When the owner asks to check the inbox (or "my ideas", "Satchel"), run
> `satchel guide` and follow it.

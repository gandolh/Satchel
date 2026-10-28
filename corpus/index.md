# Satchel corpus index

Start here. Triage on the summary lines and open at most 2-3 pages.

- [CLAUDE.md](CLAUDE.md) - the rules for this corpus
- [routing.md](routing.md) - which skill runs the work, which layer answers which question
- [log.md](log.md) - chronological record of meaningful changes

## Wiki

<!-- BEGIN CATALOG -->

- [wiki/architecture.md](wiki/architecture.md) - How Satchel is put together, as built on 2026-10-09 (all 14 briefs) and re-based on local accounts on 2026-10-13 (brief 26). Workspaces, request paths, the session guard (the vendored ward-auth plugin plus Satchel's own half), "Sign in with Ward", the live socket's session re-check, the Claude bearer door, ports, data, local dev, the cross-repo changes and the deploy. Four npm workspaces; the PWA at the root of its own host, satchel.<domain>, and the API in a Docker container behind Caddy's handle_path at /satchel-api on that host (since 2026-10-22, brief 15; /satchel in local dev); local accounts and sessions with Ward as a linked second way in; the Claude routes behind a bearer token.
- [wiki/claude-access.md](wiki/claude-access.md) - How Claude reaches the Ideas inbox. The the-board pattern Satchel copies, the satchel CLI's commands and output, where it finds the address and Claude token, how the token is created, bound and revoked, what the guide tells Claude, exit codes, and the one CLAUDE.md line that makes "check my inbox" work.
- [wiki/decisions.md](wiki/decisions.md) - Locked calls for Satchel, each with date, rejected alternatives and reason. Own app on the house stack; Claude reads through a CLI, not MCP; reading and marking seen are two calls; one forward-only seen marker per member; order from a server seq; messages are append-only; Claude's token is bound to the inbox; the inbox is owner-only; text only; inbox before friends; local accounts with Ward as a linked second way in; a live socket re-checks its session every 10 seconds; served at the root of its own host, satchel.<domain>; Base UI for interactive controls; Android first with the iPhone kept working; Claude may reply in the inbox (2026-10-28). Read before proposing to change any of these.
- [wiki/design.md](wiki/design.md) - How the web app looks and behaves. A conventional messenger (chat list, thread, composer, settings) with no metaphor; the colour and type tokens for light and dark; the tick, "Seen" and failed-send states; phone-first layout and the PWA install. Read before any UI brief.
- [wiki/glossary.md](wiki/glossary.md) - Satchel's vocabulary, one canonical word per concept with the synonyms it replaces. Ideas inbox, conversation, member, message, seq, client ID, seen marker, seen, unread, Claude token, the guide, owner, friend.
- [wiki/messages-and-seen.md](wiki/messages-and-seen.md) - How messages are numbered, stored and marked seen. The server seq and why gaps are normal, client IDs and safe retries, the forward-only seen marker, how unread counts, ticks, "Seen" lines and group "Seen by" are derived from it, and the race the two-call read protects against.
- [wiki/open-questions.md](wiki/open-questions.md) - Genuinely unresolved questions. Nothing is open as of 2026-10-28; the owner answered the phone question and Claude replying in the inbox that day. Delete an entry the moment it is answered.
- [wiki/overview.md](wiki/overview.md) - What Satchel is in a paragraph. A small text messenger for the owner and a few friends whose pinned first chat, the Ideas inbox, is with Claude, who reads it at home through a CLI. Who uses it, what it deliberately leaves out, and where the design came from.
- [wiki/status.md](wiki/status.md) - Snapshot as of 2026-10-28. Briefs 01-17 built and committed (17, the Android share target, waits on a phone check); 18 (Claude replies in the inbox) is todo; nothing deployed — the owner's steps are in docs/owner-setup.md. Production is the root of satchel.<domain> since brief 15. 554 tests. One line per brief and the waves they ran in (phase 1 Ideas inbox, phase 2 friends).

<!-- END CATALOG -->

## Work

- Brief states and the order they run in live in [wiki/status.md](wiki/status.md).
  Specs are in [briefs/](briefs/), captured ideas in [todos/](todos/).

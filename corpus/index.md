# Satchel corpus index

Start here. Triage on the summary lines and open at most 2-3 pages.

- [CLAUDE.md](CLAUDE.md) - the rules for this corpus
- [routing.md](routing.md) - which skill runs the work, which layer answers which question
- [log.md](log.md) - chronological record of meaningful changes

## Wiki

<!-- BEGIN CATALOG -->

- [wiki/architecture.md](wiki/architecture.md) - How Satchel is put together, as built on 2026-10-09 and re-based on local accounts on 2026-10-13 (Ward's move to local accounts). Workspaces, request paths, the session guard (the vendored ward-auth plugin plus Satchel's own half), "Sign in with Ward", the live socket's session re-check, the Claude bearer door, the server's layout (the estate's code structure since 2026-11-11), ports, data, local dev, the cross-repo changes and the deploy. Four npm workspaces; the PWA at the root of its own host, satchel.<domain>, and the API in a Docker container behind Caddy's handle_path at /satchel-api on that host (since 2026-10-22; /satchel in local dev); local accounts and sessions with Ward as a linked second way in; the Claude routes behind a bearer token.
- [wiki/claude-access.md](wiki/claude-access.md) - How Claude reaches the Ideas inbox. The the-board pattern Satchel copies, the satchel CLI's commands and output (reading, marking seen, and since 2026-10-28 replying), where it finds the address and Claude token, how the token is created, bound and revoked, what the guide tells Claude, exit codes, and the one CLAUDE.md line that makes "check my inbox" work.
- [wiki/decisions-tooling.md](wiki/decisions-tooling.md) - Locked calls about Satchel's tooling, each with date, rejected alternatives and reason. The house style, formatted and checked (2026-11-11): Prettier at width 120, a vendored house-style copy, the house flags kept in Satchel's own tsconfig base, and the gate that holds them. The server in the estate's code structure (2026-11-11): by feature, registered by name, zod schemas on every route, the store kept whole, the strict schemas kept strict, and the shutdown.
- [wiki/decisions.md](wiki/decisions.md) - Locked calls for Satchel, each with date, rejected alternatives and reason. Own app on the house stack; Claude reads through a CLI, not MCP; reading and marking seen are two calls; one forward-only seen marker per member; order from a server seq; messages are append-only; Claude's token is bound to the inbox; the inbox is owner-only; text only; inbox before friends; local accounts with Ward as a linked second way in; a live socket re-checks its session every 10 seconds; served at the root of its own host, satchel.<domain>; Base UI for interactive controls, styled with Tailwind; Android first with the iPhone kept working; Claude may reply in the inbox (2026-10-28); the Clay on graphite redesign (2026-11-13). Read before proposing to change any of these.
- [wiki/design.md](wiki/design.md) - How the web app looks and behaves. A conventional messenger (chat list, thread, composer, settings) with no metaphor; the Clay on graphite colour and type tokens for light and dark; the tick, "Seen" and failed-send states; phone-first layout and the PWA install. Read before any UI brief.
- [wiki/glossary.md](wiki/glossary.md) - Satchel's vocabulary, one canonical word per concept with the synonyms it replaces. Ideas inbox, conversation, member, message, seq, client ID, seen marker, seen, unread, Claude token, the guide, reply, owner, friend.
- [wiki/messages-and-seen.md](wiki/messages-and-seen.md) - How messages are numbered, stored and marked seen. The server seq and why gaps are normal, client IDs and safe retries, the forward-only seen marker, how unread counts, ticks, "Seen" lines and group "Seen by" are derived from it, and the race the two-call read protects against.
- [wiki/open-questions.md](wiki/open-questions.md) - Genuinely unresolved questions. Nothing open as of 2026-10-28; the question about Claude's reply and the seen marker was answered: a reply leaves Claude's marker alone. Delete an entry the moment it is answered.
- [wiki/overview.md](wiki/overview.md) - What Satchel is in a paragraph. A small text messenger for the owner and a few friends whose pinned first chat, the Ideas inbox, is with Claude, who reads it at home through a CLI and may answer there. Who uses it, what it deliberately leaves out, and where the design came from.
- [wiki/status.md](wiki/status.md) - Snapshot as of 2026-11-02, per area. Satchel is built (Ideas inbox and friends 2026-10-09, local accounts 2026-10-13, its own host 2026-10-22, Base UI controls 2026-10-23, the Android share target and Claude's replies 2026-10-28) and pushed, not deployed; the Android and reply checks wait on a phone. The server is in the estate's code structure (2026-11-11), waiting for a deploy. The web app is redesigned, "Clay on graphite" (2026-11-13), waiting for a deploy. 608 tests. What waits on the owner and what is still open.

<!-- END CATALOG -->

## Work

- Where things stand is a dated line per area in [wiki/status.md](wiki/status.md).
  Specs are in [briefs/](briefs/) and run in number order (restarted at 01 on
  2026-11-02); captured ideas are in [todos/](todos/).

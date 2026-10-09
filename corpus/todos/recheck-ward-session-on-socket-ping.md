---
title: Recheck the Ward session on each WebSocket ping
created: 2026-10-09
status: open
tags: [security, live]
---

# Recheck the Ward session on each WebSocket ping

A socket at `/api/live` is authenticated once, at the upgrade, and closed at
the access token's `exp`. If the session is revoked in Ward (signed out on
another device, or the grant removed), the socket keeps receiving events for
up to 15 minutes, whereas plain HTTP requests notice within 30 seconds (the
introspection cache).

## Context

Raised by brief 12's implementer. The cheap fix: on each 25-second ping,
re-run `ward.authenticate` for the socket's token (the 30-second
introspection cache keeps it cheap) and close with 4001 on failure, or with
a new code when the grant is gone. Code: `server/src/live/socket.ts` and
`server/src/routes/live.ts`.

## Acceptance

A test where introspection turns inactive mid-connection closes the socket
within one ping interval.

---
title: Hide accounts that lost their Satchel grant from the people list
created: 2026-10-09
status: open
tags: [friends, server]
---

# Hide accounts that lost their Satchel grant from the people list

`GET /api/people` lists every row in `accounts`, so an account whose grant
was removed, or that was disabled in Ward, still shows up and can be added
to new chats. Satchel only learns about a lost grant when that person makes
a request, so the fix needs a marker the guard can set (for example
`accounts.active`, cleared in the guard's 403 branch and set again on a
successful sign-in) and a filter in `listPeople`.

## Context

Surfaced by briefs 11 and 13, whose disabled test accounts kept showing up.
The README's "Inviting a friend" section documents the current behaviour.

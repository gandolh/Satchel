---
title: A person can take the name Claude
created: 2026-11-19
status: promoted
tags: [accounts, claude, owner-decision]
---

# A person can take the name Claude

> Promoted to [brief 07](../briefs/todo/07-claudes-name-carries-a-tag.md) on 2026-11-19.

Found by brief 06's builder (2026-11-19), which turned the username rename on. Claude's member in a conversation shows the display name "Claude" (`CLAUDE_DISPLAY_NAME`, `shared/src/limits.ts`). Nothing stops a person from registering or renaming to `Claude`, or to a look-alike such as `CIaude`: ward-auth 1.1.0 refuses a name that reads the same as another person's, and Claude is not a person in `auth_users`.

In a chat the two would then carry the same name. Whether that confuses depends on how the thread shows Claude's messages apart (avatar, a label); check that first.

Options, cheapest first:

1. Leave it: few people, all known to each other.
2. Show Claude's member apart wherever names appear (a label beside the name), so a person called Claude is still told apart.
3. Reserve the name: ward-auth gains a list of names no account may take, compared by the same look-alike key (a library brief in wzd_auth, then a re-vendor here). Satchel passes `["Claude"]`.

The owner picks.

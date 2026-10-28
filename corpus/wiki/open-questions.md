---
summary: Genuinely unresolved questions. One open as of 2026-10-28, from brief 18: should Claude's reply mark the inbox seen up to it, as a person's send does? (Built: it doesn't.) Delete an entry the moment it is answered.
updated: 2026-10-28
---

# Open questions

On 2026-10-28 the owner answered the two earlier ones: Satchel is used on
Android and iPhone, Android first, with a share target on Android only; and
Claude may reply in the Ideas inbox, through a `satchel reply` command. Both
are in [decisions.md](decisions.md).

## Should Claude's reply mark the inbox seen?

Raised 2026-10-28 by [brief 18](../briefs/done/18-claude-replies-in-the-inbox.md).
The brief said to follow the existing rule, and a person's send does move
their own marker to it. Built the other way: a reply leaves Claude's marker
alone, so a message sent while Claude was writing isn't skipped (the two-call
read in [decisions.md](decisions.md)). The cost: the owner's ticks turn blue
only after `satchel seen`, not at the reply. Answer "keep it" or "mark on
reply"; the second is a one-line change in `server/src/routes/claude.ts` plus
its test.

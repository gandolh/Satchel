---
summary: Genuinely unresolved questions as of 2026-10-09. iPhone or Android for push, and whether Claude should reply in the inbox. Delete an entry the moment it is answered.
updated: 2026-10-09
---

# Open questions

## iPhone or Android?
On iPhone, web push works only after "Add to Home Screen", and a PWA can't
appear in the share sheet. Android has neither limit. Matters for brief 14
(push) and for whether an Expo wrapper is ever worth it. Phase 1 doesn't
depend on it.

## Should Claude reply in the inbox?
Today Claude only marks messages seen and talks to the owner in the Claude
Code session. A `satchel reply` command and `POST /claude/messages` would let
it answer in the thread. Proposed: later, once the seen marker has been used
for a while. Any change here touches [decisions.md](decisions.md) (the guide
and the token's write rights).


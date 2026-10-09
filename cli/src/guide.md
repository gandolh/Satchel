# satchel: how to read the owner's Ideas inbox

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

Commands:

  satchel guide                    this text
  satchel unread                   unread messages, oldest first, and the `seen` line to run
  satchel seen <n>                 mark everything up to #n as seen
  satchel history [--after n] [--since date] [--limit n]
                                   older messages, seen or not

Exit codes: 0 ok, 1 usage error, 2 Satchel rejected the call, 3 not reachable.

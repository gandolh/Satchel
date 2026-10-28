# satchel: how to read, and answer in, the owner's Ideas inbox

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
8. When a message asks you something, you may answer it in the inbox with
   `satchel reply N "answer"`, N being the message you answer. Keep it to a
   few lines. Never put a secret, a password or the token in a reply. Still
   tell the owner in the session, as in step 3. A reply marks nothing seen:
   step 4 still applies. If a reply fails with exit 3, check `satchel history`
   before sending it again: a message can't be taken back.

Commands:

  satchel guide                    this text
  satchel unread                   unread messages, oldest first, and the `seen` line to run
  satchel seen <n>                 mark everything up to #n as seen
  satchel history [--after n] [--since date] [--limit n]
                                   older messages, seen or not, and your replies
  satchel reply <n> [text]         answer #n in the inbox ("Re #n: text"); with no
                                   text, it reads the text from stdin

Exit codes: 0 ok, 1 usage error, 2 Satchel rejected the call, 3 not reachable.

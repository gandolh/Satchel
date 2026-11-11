import { GROUP_MEMBERS_MAX, GROUP_MEMBERS_MIN, GROUP_TITLE_MAX_LENGTH, type Person } from "@satchel/shared";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, createConversation, listPeople, NetworkError, SignedOut } from "../api";
import { Checkbox } from "../components/ui/Checkbox";
import { refreshConversations } from "../chats/conversations";
import { Avatar } from "../layout/Avatar";
import { ScreenHeader } from "../layout/ScreenHeader";
import { CHATS, navigate, threadRoute } from "../router";
import { filterPeople } from "./people";
import { field, fieldInput, fieldLabel, listNote, screen, screenBody } from "../layout/looks";
import { Button } from "../components/ui/Button";

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof NetworkError) return error.message;
  return "Something went wrong. Try again.";
}

/** A row in the people list: an avatar and a name, as a button (a chat) or a label (a group's checkbox). */
const personRow =
  "flex min-h-16 w-full cursor-pointer items-center gap-3 border-b border-line bg-transparent px-4 py-2 text-left text-inherit hover:bg-sunk";
const personName = "min-w-0 flex-1 overflow-hidden font-title font-semibold text-ellipsis whitespace-nowrap";
const actions = "flex flex-wrap items-center gap-3 px-4 py-3";

/** `/satchel/new`: pick someone to chat with, or pick two or more and name a group. */
export function NewChat() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listPeople().then(
      (response) => {
        if (live) setPeople(response.people);
      },
      (e: unknown) => {
        if (live && !(e instanceof SignedOut)) setLoadError(describe(e));
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const open = async (body: Parameters<typeof createConversation>[0]) => {
    setBusy(true);
    setError(null);
    try {
      const { conversation } = await createConversation(body);
      void refreshConversations();
      navigate(threadRoute(conversation.id), { replace: true });
    } catch (e) {
      if (!(e instanceof SignedOut)) setError(describe(e));
      setBusy(false);
    }
  };

  const atMax = picked.length >= GROUP_MEMBERS_MAX;
  const canCreate =
    group && picked.length >= GROUP_MEMBERS_MIN && picked.length <= GROUP_MEMBERS_MAX && title.trim() !== "" && !busy;

  const toggle = (subject: string) =>
    setPicked((current) => {
      if (current.includes(subject)) return current.filter((s) => s !== subject);
      return current.length >= GROUP_MEMBERS_MAX ? current : [...current, subject];
    });

  const submitGroup = (event: FormEvent) => {
    event.preventDefault();
    // Enter in the search box of a plain New chat lands here too.
    if (!canCreate) return;
    void open({ kind: "group", title: title.trim(), members: picked });
  };

  const visible = people ? filterPeople(people, query) : [];

  return (
    <section className={screen}>
      <ScreenHeader back title={group ? "New group" : "New chat"} />
      <div className={screenBody}>
        {people === null ? (
          loadError ? (
            <div className={listNote} role="alert">
              <p>{loadError}</p>
              <Button
                variant="quiet"
                onClick={() => {
                  setLoadError(null);
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </Button>
            </div>
          ) : (
            <p className={listNote} role="status">
              Loading people…
            </p>
          )
        ) : people.length === 0 ? (
          <p className={listNote}>
            No one else is on Satchel yet. Friends appear here after they sign in for the first time.
          </p>
        ) : (
          <form className="grid gap-3 px-4 py-3" onSubmit={submitGroup}>
            {group && (
              <label className={field}>
                <span className={fieldLabel}>Group name</span>
                <input
                  className={fieldInput}
                  value={title}
                  maxLength={GROUP_TITLE_MAX_LENGTH}
                  autoComplete="off"
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
            )}
            <input
              className={fieldInput}
              type="search"
              aria-label="Search people"
              placeholder="Search people"
              value={query}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
            {!group && (
              <Button
                variant="quiet"
                className="justify-self-start"
                onClick={() => {
                  setGroup(true);
                  setError(null);
                }}
              >
                New group
              </Button>
            )}
            <ul className="-mx-4 bg-surface" aria-label="People">
              {visible.map((person) => {
                const checked = picked.includes(person.subject);
                return (
                  <li key={person.subject}>
                    {group ? (
                      <label className={personRow}>
                        <Avatar name={person.displayName} />
                        <span className={personName}>{person.displayName}</span>
                        <Checkbox
                          checked={checked}
                          disabled={!checked && atMax}
                          onCheckedChange={() => toggle(person.subject)}
                        />
                      </label>
                    ) : (
                      <button
                        type="button"
                        className={personRow}
                        disabled={busy}
                        onClick={() => void open({ kind: "direct", with: person.subject })}
                      >
                        <Avatar name={person.displayName} />
                        <span className={personName}>{person.displayName}</span>
                      </button>
                    )}
                  </li>
                );
              })}
              {visible.length === 0 && <li className={listNote}>No one matches “{query.trim()}”.</li>}
            </ul>
            {error && (
              <p className="text-bad" role="alert">
                {error}
              </p>
            )}
            {group && (
              <div className={actions}>
                <p className="flex-[1_0_100%] text-muted" role="status">
                  {picked.length === 0
                    ? `Pick at least ${GROUP_MEMBERS_MIN} people.`
                    : `${picked.length} picked${picked.length < GROUP_MEMBERS_MIN ? `, pick at least ${GROUP_MEMBERS_MIN}` : ""}${atMax ? `. That's the most a group can have (${GROUP_MEMBERS_MAX}).` : "."}`}
                </p>
                <Button variant="quiet" onClick={() => (setGroup(false), setPicked([]))}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canCreate}>
                  {busy ? "Creating…" : "Create group"}
                </Button>
              </div>
            )}
          </form>
        )}
        {people !== null && people.length === 0 && (
          <div className={actions}>
            <Button variant="quiet" onClick={() => navigate(CHATS)}>
              Back to chats
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

import { GROUP_MEMBERS_MAX, GROUP_MEMBERS_MIN, GROUP_TITLE_MAX_LENGTH, type Person } from "@satchel/shared";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, createConversation, listPeople, NetworkError, SignedOut } from "../api";
import { Checkbox } from "../components/ui/Checkbox";
import { refreshConversations } from "../chats/conversations";
import { Avatar } from "../layout/Avatar";
import { ScreenHeader } from "../layout/ScreenHeader";
import { CHATS, navigate, threadRoute } from "../router";
import { filterPeople } from "./people";
import { cn } from "../lib/cn";
import { errorLine, field, fieldInput, fieldLabel, listNote, screen, screenBody } from "../layout/looks";
import { SearchIcon } from "../layout/icons";
import { Button } from "../components/ui/Button";

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof NetworkError) return error.message;
  return "Something went wrong. Try again.";
}

/** A row in the people list: an avatar and a name, as a button (a chat) or a label (a group's checkbox). */
const personRow =
  "flex min-h-16 w-full cursor-pointer items-center gap-3 bg-transparent pr-1 pl-3 text-left text-inherit";
const personName = "min-w-0 flex-1 overflow-hidden text-input font-semibold text-ellipsis whitespace-nowrap";

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
      <ScreenHeader back large title={group ? "New group" : "New chat"} />
      {people === null ? (
        <div className={screenBody}>
          {loadError ? (
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
          )}
        </div>
      ) : people.length === 0 ? (
        <div className={screenBody}>
          <p className={listNote}>
            No one else is on Satchel yet. Friends appear here after they sign in for the first time.
          </p>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Button variant="quiet" onClick={() => navigate(CHATS)}>
              Back to chats
            </Button>
          </div>
        </div>
      ) : (
        <form className={cn(screenBody, "flex flex-col")} onSubmit={submitGroup}>
          <div className="flex min-h-full flex-col wide:max-w-150">
            <div className="grid content-start gap-4 p-4 wide:p-6">
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
              <label className={field}>
                <span className={fieldLabel}>Search people</span>
                <span className="relative block">
                  <input
                    className={cn(fieldInput, "pl-12")}
                    type="search"
                    value={query}
                    autoComplete="off"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted [&_svg]:size-5">
                    <SearchIcon />
                  </span>
                </span>
              </label>
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
              <ul className="overflow-hidden rounded-bubble border border-line bg-surface" aria-label="People">
                {visible.map((person) => {
                  const checked = picked.includes(person.subject);
                  return (
                    <li key={person.subject} className="border-b border-line last:border-b-0">
                      {group ? (
                        <label
                          className={cn(
                            personRow,
                            "motion-safe:transition-colors motion-safe:duration-120",
                            checked ? "bg-accent-soft" : "hover:bg-row-hover",
                          )}
                        >
                          <Avatar name={person.displayName} size="sm" />
                          <span className={personName}>{person.displayName}</span>
                          <span className="grid size-12 flex-none place-items-center">
                            <Checkbox
                              checked={checked}
                              disabled={!checked && atMax}
                              onCheckedChange={() => toggle(person.subject)}
                            />
                          </span>
                        </label>
                      ) : (
                        <button
                          type="button"
                          className={cn(
                            personRow,
                            "pr-3 hover:bg-row-hover motion-safe:transition-colors motion-safe:duration-120",
                          )}
                          disabled={busy}
                          onClick={() => void open({ kind: "direct", with: person.subject })}
                        >
                          <Avatar name={person.displayName} size="sm" />
                          <span className={personName}>{person.displayName}</span>
                        </button>
                      )}
                    </li>
                  );
                })}
                {visible.length === 0 && <li className={listNote}>No one matches “{query.trim()}”.</li>}
              </ul>
              {error && (
                <p className={errorLine} role="alert">
                  {error}
                </p>
              )}
            </div>
            {group && (
              <div className="sticky bottom-0 mt-auto flex items-center gap-2 border-t border-line bg-surface px-4 py-3 wide:static wide:mt-0 wide:flex-wrap wide:gap-3 wide:border-t-0 wide:bg-transparent wide:px-6 wide:pt-0 wide:pb-6">
                <p className="min-w-0 flex-1 text-compact text-ink-2 tabular-nums wide:flex-[1_0_100%]" role="status">
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
          </div>
        </form>
      )}
    </section>
  );
}

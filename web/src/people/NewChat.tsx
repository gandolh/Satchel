import { GROUP_MEMBERS_MIN, GROUP_TITLE_MAX_LENGTH, type Person } from "@satchel/shared";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, createConversation, listPeople, NetworkError, SignedOut } from "../api";
import { refreshConversations } from "../chats/conversations";
import { Avatar } from "../layout/Avatar";
import { ScreenHeader } from "../layout/ScreenHeader";
import { CHATS, navigate, threadRoute } from "../router";
import { filterPeople } from "./people";
import "./people.css";

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof NetworkError) return error.message;
  return "Something went wrong. Try again.";
}

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

  const toggle = (subject: string) =>
    setPicked((current) => (current.includes(subject) ? current.filter((s) => s !== subject) : [...current, subject]));

  const submitGroup = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    void open({ kind: "group", title: title.trim(), members: picked });
  };

  const visible = people ? filterPeople(people, query) : [];
  const canCreate = picked.length >= GROUP_MEMBERS_MIN && title.trim() !== "" && !busy;

  return (
    <section className="screen new-chat">
      <ScreenHeader back title={group ? "New group" : "New chat"} />
      <div className="screen__body">
        {people === null ? (
          loadError ? (
            <div className="list-note" role="alert">
              <p>{loadError}</p>
              <button type="button" className="button button--quiet" onClick={() => {
                  setLoadError(null);
                  setAttempt((n) => n + 1);
                }}>
                Try again
              </button>
            </div>
          ) : (
            <p className="list-note" role="status">
              Loading people…
            </p>
          )
        ) : people.length === 0 ? (
          <p className="list-note">
            No one else is on Satchel yet. Friends appear here after they sign in for the first time.
          </p>
        ) : (
          <form className="new-chat__form" onSubmit={submitGroup}>
            {group && (
              <label className="field">
                <span className="field__label">Group name</span>
                <input
                  className="field__input"
                  value={title}
                  maxLength={GROUP_TITLE_MAX_LENGTH}
                  autoComplete="off"
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
            )}
            <input
              className="field__input"
              type="search"
              aria-label="Search people"
              placeholder="Search people"
              value={query}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
            {!group && (
              <button
                type="button"
                className="button button--quiet new-chat__group-toggle"
                onClick={() => {
                  setGroup(true);
                  setError(null);
                }}
              >
                New group
              </button>
            )}
            <ul className="people" aria-label="People">
              {visible.map((person) => {
                const checked = picked.includes(person.subject);
                return (
                  <li key={person.subject}>
                    {group ? (
                      <label className="person">
                        <Avatar name={person.displayName} />
                        <span className="person__name">{person.displayName}</span>
                        <input type="checkbox" checked={checked} onChange={() => toggle(person.subject)} />
                      </label>
                    ) : (
                      <button
                        type="button"
                        className="person"
                        disabled={busy}
                        onClick={() => void open({ kind: "direct", with: person.subject })}
                      >
                        <Avatar name={person.displayName} />
                        <span className="person__name">{person.displayName}</span>
                      </button>
                    )}
                  </li>
                );
              })}
              {visible.length === 0 && <li className="list-note">No one matches “{query.trim()}”.</li>}
            </ul>
            {error && (
              <p className="new-chat__error" role="alert">
                {error}
              </p>
            )}
            {group && (
              <div className="new-chat__actions">
                <p className="muted" role="status">
                  {picked.length === 0
                    ? `Pick at least ${GROUP_MEMBERS_MIN} people.`
                    : `${picked.length} picked${picked.length < GROUP_MEMBERS_MIN ? `, pick at least ${GROUP_MEMBERS_MIN}` : ""}.`}
                </p>
                <button type="button" className="button button--quiet" onClick={() => (setGroup(false), setPicked([]))}>
                  Cancel
                </button>
                <button type="submit" className="button" disabled={!canCreate}>
                  {busy ? "Creating…" : "Create group"}
                </button>
              </div>
            )}
          </form>
        )}
        {people !== null && people.length === 0 && (
          <div className="new-chat__actions">
            <button type="button" className="button button--quiet" onClick={() => navigate(CHATS)}>
              Back to chats
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

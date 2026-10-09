import type { ClaudeTokenSummary } from "@satchel/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, createClaudeToken, listClaudeTokens, revokeClaudeToken, SignedOut } from "../api";
import { useMe } from "../auth/session";
import { clockTime } from "../chats/time";
import "./connect-claude.css";

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** "9 Oct 21:40", local time. */
function dateTime(iso: string): string {
  const date = new Date(iso);
  return `${dayMonth.format(date)} ${clockTime(date)}`;
}

const TOKEN_FILE = "~/.config/satchel/env";

/** What the panel needs; the token string lives only here and goes when the panel closes. */
interface Shown {
  id: string;
  token: string;
}

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "Couldn't reach Satchel. Try again.";
}

/**
 * Settings, Connect Claude. Only the owner has an Ideas inbox (`inboxId`) and
 * may make tokens; for a friend the card isn't there at all.
 */
export function ConnectClaude() {
  const { inboxId } = useMe();
  return inboxId === null ? null : <ConnectClaudeCard />;
}

/** Create, list and revoke the token the `satchel` CLI uses. */
function ConnectClaudeCard() {
  const [tokens, setTokens] = useState<ClaudeTokenSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [copied, setCopied] = useState<"yes" | "selected" | null>(null);
  const line = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    try {
      const { tokens: list } = await listClaudeTokens();
      setTokens(list);
      setError(null);
    } catch (e) {
      if (!(e instanceof SignedOut)) setError(message(e));
    }
  }, []);

  useEffect(() => {
    let live = true;
    listClaudeTokens().then(
      ({ tokens: list }) => {
        if (live) setTokens(list);
      },
      (e: unknown) => {
        if (live && !(e instanceof SignedOut)) setError(message(e));
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { id, token } = await createClaudeToken();
      setShown({ id, token });
      setCopied(null);
      await load();
    } catch (e) {
      if (!(e instanceof SignedOut)) setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await revokeClaudeToken(id);
      setConfirming(null);
      if (shown?.id === id) setShown(null);
      await load();
    } catch (e) {
      if (!(e instanceof SignedOut)) setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const selectLine = () => {
    const el = line.current;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const copy = async () => {
    if (!shown) return;
    try {
      await navigator.clipboard.writeText(`SATCHEL_TOKEN=${shown.token}`);
      setCopied("yes");
    } catch {
      selectLine();
      setCopied("selected");
    }
  };

  const active = tokens?.filter((t) => t.revokedAt === null) ?? [];

  return (
    <section className="card" aria-labelledby="settings-connect-claude">
      <h3 className="card__title" id="settings-connect-claude">
        Connect Claude
      </h3>
      <p className="muted">
        A token lets the <code>satchel</code> command read your Ideas inbox. It can't see any other chat.
      </p>

      {shown && (
        <div className="token-panel" role="region" aria-label="New token">
          <p className="token-panel__once">This is the only time Satchel shows this token.</p>
          <p>
            Put this line in <code>{TOKEN_FILE}</code>:
          </p>
          <code className="token-panel__line" ref={line}>
            SATCHEL_TOKEN={shown.token}
          </code>
          <div className="token-panel__actions">
            <button type="button" className="button" onClick={() => void copy()}>
              Copy
            </button>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => {
                setShown(null);
                setCopied(null);
              }}
            >
              Done
            </button>
          </div>
          <p className="muted" role="status">
            {copied === "yes" && "Copied."}
            {copied === "selected" && "Couldn't copy. The line is selected: copy it yourself."}
          </p>
        </div>
      )}

      {tokens === null ? (
        !error && <p className="muted">Loading…</p>
      ) : tokens.length === 0 ? (
        <p className="muted">No tokens yet.</p>
      ) : (
        <ul className="tokens">
          {tokens.map((token) => {
            const revoked = token.revokedAt !== null;
            return (
              <li key={token.id} className={revoked ? "token-row token-row--revoked" : "token-row"}>
                <div className="token-row__text">
                  <span>Created {dateTime(token.createdAt)}</span>
                  <span className="muted">
                    {revoked
                      ? `Revoked ${dateTime(token.revokedAt as string)}`
                      : token.lastUsedAt
                        ? `Last used ${dateTime(token.lastUsedAt)}`
                        : "Never used"}
                  </span>
                </div>
                {!revoked && (
                  <div className="token-row__actions">
                    {confirming === token.id ? (
                      <>
                        <button
                          type="button"
                          className="button button--danger"
                          disabled={busy}
                          onClick={() => void revoke(token.id)}
                        >
                          Confirm revoke
                        </button>
                        <button type="button" className="button button--quiet" onClick={() => setConfirming(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button type="button" className="button button--quiet" onClick={() => setConfirming(token.id)}>
                        Revoke
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="connect-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="button" className="button" disabled={busy} onClick={() => void create()}>
          Create token
        </button>
        {active.length > 1 && <span className="muted"> {active.length} active tokens.</span>}
      </div>
    </section>
  );
}

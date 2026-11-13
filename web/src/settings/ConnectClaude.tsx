import type { ClaudeTokenSummary } from "@satchel/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, createClaudeToken, listClaudeTokens, revokeClaudeToken, SignedOut } from "../api";
import { useMe } from "../auth/session";
import { clockTime } from "../chats/time";
import { Button } from "../components/ui/Button";
import { Card } from "../layout/Card";
import { cn } from "../lib/cn";

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
    <Card title="Connect Claude" titleId="settings-connect-claude">
      <p className="text-muted">
        A token lets the <code>satchel</code> command read your Ideas inbox. It can't see any other chat.
      </p>

      {shown && (
        <div
          className="grid gap-3 rounded-md border border-accent bg-accent-soft p-4"
          role="region"
          aria-label="New token"
        >
          <p className="font-semibold">This is the only time Satchel shows this token.</p>
          <p>
            Put this line in <code>{TOKEN_FILE}</code>:
          </p>
          <code className="rounded-sm bg-surface p-3 font-mono text-compact wrap-anywhere select-all" ref={line}>
            SATCHEL_TOKEN={shown.token}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void copy()}>Copy</Button>
            <Button
              variant="quiet"
              onClick={() => {
                setShown(null);
                setCopied(null);
              }}
            >
              Done
            </Button>
          </div>
          <p className="text-muted" role="status">
            {copied === "yes" && "Copied."}
            {copied === "selected" && "Couldn't copy. The line is selected: copy it yourself."}
          </p>
        </div>
      )}

      {tokens === null ? (
        !error && <p className="text-muted">Loading…</p>
      ) : tokens.length === 0 ? (
        <p className="text-muted">No tokens yet.</p>
      ) : (
        <ul className="grid gap-2">
          {tokens.map((token) => {
            const revoked = token.revokedAt !== null;
            return (
              <li
                key={token.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md border border-line p-3",
                  revoked && "opacity-55",
                )}
              >
                <div className="grid min-w-0 gap-0.5 text-compact">
                  <span>Created {dateTime(token.createdAt)}</span>
                  <span className="text-muted">
                    {revoked
                      ? `Revoked ${dateTime(token.revokedAt as string)}`
                      : token.lastUsedAt
                        ? `Last used ${dateTime(token.lastUsedAt)}`
                        : "Never used"}
                  </span>
                </div>
                {!revoked && (
                  <div className="flex gap-2">
                    {confirming === token.id ? (
                      <>
                        <Button variant="danger" disabled={busy} onClick={() => void revoke(token.id)}>
                          Confirm revoke
                        </Button>
                        <Button variant="quiet" onClick={() => setConfirming(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button variant="quiet" onClick={() => setConfirming(token.id)}>
                        Revoke
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="text-compact text-bad" role="alert">
          {error}
        </p>
      )}
      <div>
        <Button disabled={busy} onClick={() => void create()}>
          Create token
        </Button>
        {active.length > 1 && <span className="text-muted"> {active.length} active tokens.</span>}
      </div>
    </Card>
  );
}

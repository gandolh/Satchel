import { useId, useState, type FormEvent } from "react";
import {
  useChangePassword,
  useSession,
  useSetLocalPassword,
  useWardLink,
  useWardSignOut,
  useWardUnlink,
  type AuthError,
} from "../../vendor/ward/ward-auth-react.js";
import { settingsMessage } from "../auth/messages";
import { Button } from "../components/ui/Button";
import { Card } from "../layout/Card";
import { errorLine, field, fieldInput, fieldLabel } from "../layout/looks";

/**
 * Settings: how this account signs in. A local password (set one, or change
 * it) and the Ward account (link it, unlink it). The hooks render nothing; the
 * words are Satchel's (`auth/messages.ts`).
 *
 * - A user created by a first Ward sign-in has no password yet. Setting one
 *   works within ten minutes of that sign-in; after that Ward asks for its own
 *   password again (`reauthenticate`) and brings the person back.
 * - Unlinking Ward is refused until there is a local password, so nobody locks
 *   themselves out. A session that began with Ward ends with the unlink.
 */
export function SignInMethods() {
  const session = useSession();
  const titleId = useId();
  if (session.status !== "signed_in") return null;
  const { user, ward } = session;
  return (
    <Card title="Sign in" titleId={titleId} className="gap-3">
      {user.hasPassword ? <ChangePassword /> : <SetPassword />}
      {ward.enabled && (
        <WardAccount linked={ward.linked} hasPassword={user.hasPassword} fromWard={session.session.origin === "ward"} />
      )}
    </Card>
  );
}

function ErrorLine({ error }: { error: AuthError | null }) {
  return error === null ? null : (
    <p className={errorLine} role="alert">
      {settingsMessage(error)}
    </p>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
}) {
  const id = useId();
  return (
    <div className={field}>
      <label className={fieldLabel} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={fieldInput}
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** A user with a password: change it. */
function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const { changePassword, pending, error, done, reset } = useChangePassword();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending || current === "" || next === "") return;
    void changePassword(current, next).then((ok) => {
      if (ok) {
        setCurrent("");
        setNext("");
      }
    });
  };

  return (
    <form className="grid gap-3" onSubmit={submit} onChange={reset}>
      <p className="text-muted">Your password signs you in even when Ward is down.</p>
      <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
      <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
      <ErrorLine error={error} />
      {done && error === null && (
        <p className="text-muted" role="status">
          Password changed. Your other sessions were signed out.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="quiet" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}

/** A user who only ever signed in with Ward: set a first password. */
function SetPassword() {
  const [next, setNext] = useState("");
  const { setPassword, reauthenticate, reauthenticated, pending, error, reset } = useSetLocalPassword();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending || next === "") return;
    void setPassword(next).then((ok) => {
      if (ok) setNext("");
    });
  };

  return (
    <form className="grid gap-3" onSubmit={submit} onChange={reset}>
      <p className="text-muted">
        You sign in with Ward. Set a password too, so you can still get in when Ward isn&rsquo;t reachable.
      </p>
      {reauthenticated && (
        <p className="text-muted" role="status">
          Confirmed with Ward. Set the password now.
        </p>
      )}
      <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
      <ErrorLine error={error} />
      <div className="flex flex-wrap gap-3">
        <Button variant="quiet" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Set password"}
        </Button>
        {error?.code === "reauthentication_required" && (
          <Button variant="quiet" onClick={() => void reauthenticate()}>
            Sign in to Ward again
          </Button>
        )}
      </div>
    </form>
  );
}

/** Link or unlink the Ward account, and sign out of Ward too when this session began there. */
function WardAccount({ linked, hasPassword, fromWard }: { linked: boolean; hasPassword: boolean; fromWard: boolean }) {
  const link = useWardLink();
  const unlink = useWardUnlink();
  const out = useWardSignOut();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="grid gap-1">
      <p className="text-muted">{linked ? "A Ward account is linked to this one." : "No Ward account is linked."}</p>
      {linked && !hasPassword && <p className="text-muted">Set a password above before you unlink Ward.</p>}
      <ErrorLine error={link.error ?? unlink.error ?? out.error} />
      <div className="flex flex-wrap gap-3">
        {!linked && (
          <Button variant="quiet" disabled={link.pending} onClick={() => void link.link()}>
            {link.pending ? "Going to Ward…" : "Link Ward"}
          </Button>
        )}
        {linked && !confirming && (
          <Button variant="quiet" disabled={!hasPassword} onClick={() => setConfirming(true)}>
            Unlink Ward
          </Button>
        )}
        {linked && confirming && (
          <>
            <Button
              variant="danger"
              disabled={unlink.pending}
              onClick={() => {
                void unlink.unlink().then(() => setConfirming(false));
              }}
            >
              {unlink.pending ? "Unlinking…" : "Unlink Ward"}
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        )}
        {fromWard && (
          <Button variant="quiet" disabled={out.pending} onClick={() => void out.signOut()}>
            Sign out of Ward too
          </Button>
        )}
      </div>
    </div>
  );
}

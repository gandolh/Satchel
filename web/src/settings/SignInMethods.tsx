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
import "../auth/auth.css";

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
    <section className="card signin-methods" aria-labelledby={titleId}>
      <h3 className="card__title" id={titleId}>
        Sign in
      </h3>
      {user.hasPassword ? <ChangePassword /> : <SetPassword />}
      {ward.enabled && <WardAccount linked={ward.linked} hasPassword={user.hasPassword} fromWard={session.session.origin === "ward"} />}
    </section>
  );
}

function ErrorLine({ error }: { error: AuthError | null }) {
  return error === null ? null : (
    <p className="login__error" role="alert">
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
    <div className="login__field">
      <label className="login__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="login__input"
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
    <form className="signin-methods__form" onSubmit={submit} onChange={reset}>
      <p className="muted">Your password signs you in even when Ward is down.</p>
      <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
      <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
      <ErrorLine error={error} />
      {done && error === null && (
        <p className="muted" role="status">
          Password changed. Your other sessions were signed out.
        </p>
      )}
      <div className="signin-methods__actions">
        <button type="submit" className="button button--quiet" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </button>
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
    <form className="signin-methods__form" onSubmit={submit} onChange={reset}>
      <p className="muted">
        You sign in with Ward. Set a password too, so you can still get in when Ward isn&rsquo;t reachable.
      </p>
      {reauthenticated && (
        <p className="muted" role="status">
          Confirmed with Ward. Set the password now.
        </p>
      )}
      <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
      <ErrorLine error={error} />
      <div className="signin-methods__actions">
        <button type="submit" className="button button--quiet" disabled={pending}>
          {pending ? "Saving…" : "Set password"}
        </button>
        {error?.code === "reauthentication_required" && (
          <button type="button" className="button button--quiet" onClick={() => void reauthenticate()}>
            Sign in to Ward again
          </button>
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
    <div className="signin-methods__row">
      <p className="muted">{linked ? "A Ward account is linked to this one." : "No Ward account is linked."}</p>
      {linked && !hasPassword && <p className="muted">Set a password above before you unlink Ward.</p>}
      <ErrorLine error={link.error ?? unlink.error ?? out.error} />
      <div className="signin-methods__actions">
        {!linked && (
          <button type="button" className="button button--quiet" disabled={link.pending} onClick={() => void link.link()}>
            {link.pending ? "Going to Ward…" : "Link Ward"}
          </button>
        )}
        {linked && !confirming && (
          <button type="button" className="button button--quiet" disabled={!hasPassword} onClick={() => setConfirming(true)}>
            Unlink Ward
          </button>
        )}
        {linked && confirming && (
          <>
            <button
              type="button"
              className="button button--danger"
              disabled={unlink.pending}
              onClick={() => {
                void unlink.unlink().then(() => setConfirming(false));
              }}
            >
              {unlink.pending ? "Unlinking…" : "Unlink Ward"}
            </button>
            <button type="button" className="button button--quiet" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        )}
        {fromWard && (
          <button type="button" className="button button--quiet" disabled={out.pending} onClick={() => void out.signOut()}>
            Sign out of Ward too
          </button>
        )}
      </div>
    </div>
  );
}

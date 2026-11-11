import { useId, useState, type FormEvent } from "react";
import { useLogin, useSession, useWardSignIn, type AuthError } from "../../vendor/ward/ward-auth-react.js";
import { Gate, GateMessage } from "../layout/Gate";
import { errorLine, field, fieldInput, fieldLabel } from "../layout/looks";
import { returnToFor } from "../ward";
import { loginMessage, sessionReasonMessage, wardSignInMessage } from "./messages";
import { Button } from "../components/ui/Button";

export interface LoginViewProps {
  /** Whether the server has Ward configured: the button shows only then. */
  wardEnabled: boolean;
  /** Why the last session ended (`ward_unavailable`, `ward_session_ended`), if the server said. */
  reason?: string;
  pending?: boolean;
  /** A failed password sign-in. */
  error?: AuthError | null;
  /** A failed Ward sign-in: from the button, or the redirect back (`access_denied`, ...). */
  wardError?: AuthError | null;
  onLogin?: (username: string, password: string) => void;
  onWard?: () => void;
  /** Dismiss the Ward message. */
  onDismissWard?: () => void;
}

/** The login page itself, without the hooks: `LoginPage` feeds it. */
export function LoginView({
  wardEnabled,
  reason,
  pending = false,
  error = null,
  wardError = null,
  onLogin,
  onWard,
  onDismissWard,
}: LoginViewProps) {
  const id = useId();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const notice = sessionReasonMessage(reason);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending || username.trim() === "" || password === "") return;
    onLogin?.(username.trim(), password);
  };

  return (
    <Gate title="Sign in to Satchel" busy={pending} className="w-full max-w-[340px]">
      {notice !== null && <GateMessage role="status">{notice}</GateMessage>}
      <form className="grid w-full gap-3 text-left" onSubmit={submit}>
        <div className={field}>
          <label className={fieldLabel} htmlFor={`${id}-username`}>
            Username
          </label>
          <input
            id={`${id}-username`}
            className={fieldInput}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div className={field}>
          <label className={fieldLabel} htmlFor={`${id}-password`}>
            Password
          </label>
          <input
            id={`${id}-password`}
            className={fieldInput}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {error !== null && (
          <p className={errorLine} role="alert">
            {loginMessage(error)}
          </p>
        )}
        <Button className="w-full" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      {wardEnabled && (
        <>
          <p className="text-meta text-muted" aria-hidden="true">
            or
          </p>
          <Button variant="quiet" className="w-full" onClick={onWard}>
            Sign in with Ward
          </Button>
          {wardError !== null && (
            <p className={errorLine} role="alert">
              {wardSignInMessage(wardError)}{" "}
              <button
                type="button"
                className="border-0 bg-transparent p-0 text-accent underline"
                onClick={onDismissWard}
              >
                Dismiss
              </button>
            </p>
          )}
        </>
      )}
    </Gate>
  );
}

/** The auth gate's signed-out screen: the form, and the Ward button when the server has Ward. */
export function LoginPage() {
  const session = useSession();
  const { login, pending, error } = useLogin();
  const ward = useWardSignIn();
  const wardEnabled = session.status === "signed_out" && session.ward.enabled;
  return (
    <LoginView
      wardEnabled={wardEnabled}
      {...(session.status === "signed_out" && session.reason !== undefined ? { reason: session.reason } : {})}
      pending={pending}
      error={error}
      wardError={ward.error}
      onLogin={(username, password) => void login(username, password)}
      onWard={() => void ward.signIn({ returnTo: returnToFor(window.location) })}
      onDismissWard={ward.reset}
    />
  );
}

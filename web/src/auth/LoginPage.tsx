import { useId, useState, type FormEvent } from "react";
import { useLogin, useSession, useWardSignIn, type AuthError } from "../../vendor/ward/ward-auth-react.js";
import { returnToFor } from "../ward";
import { loginMessage, sessionReasonMessage, wardSignInMessage } from "./messages";
import "./auth.css";

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
    <main className="gate" aria-busy={pending || undefined}>
      <div className="gate__panel login">
        <span className="mark" aria-hidden="true">
          S
        </span>
        <h1 className="gate__title">Sign in to Satchel</h1>
        {notice !== null && (
          <p className="gate__message" role="status">
            {notice}
          </p>
        )}
        <form className="login__form" onSubmit={submit}>
          <div className="login__field">
            <label className="login__label" htmlFor={`${id}-username`}>
              Username
            </label>
            <input
              id={`${id}-username`}
              className="login__input"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="login__field">
            <label className="login__label" htmlFor={`${id}-password`}>
              Password
            </label>
            <input
              id={`${id}-password`}
              className="login__input"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error !== null && (
            <p className="login__error" role="alert">
              {loginMessage(error)}
            </p>
          )}
          <button type="submit" className="button login__submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {wardEnabled && (
          <>
            <p className="login__or" aria-hidden="true">
              or
            </p>
            <button type="button" className="button button--quiet login__submit" onClick={onWard}>
              Sign in with Ward
            </button>
            {wardError !== null && (
              <p className="login__error" role="alert">
                {wardSignInMessage(wardError)}{" "}
                <button type="button" className="login__dismiss" onClick={onDismissWard}>
                  Dismiss
                </button>
              </p>
            )}
          </>
        )}
      </div>
    </main>
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

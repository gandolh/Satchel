import { useEffect, useState, type ReactNode } from "react";
import { useLogout, useSession } from "../../vendor/ward/ward-auth-react.js";
import { live } from "../live";
import { forgetPushSubscription, rebindPushSubscription } from "../push/account";
import { LoginPage } from "./LoginPage";
import { checkSession, MeContext, type GateState } from "./session";

/**
 * The session gate around the whole app. The vendored hooks hold the session
 * (`useSession`, one shared state asked of `GET /auth/session`):
 *
 * - loading: a quiet "Loading…" screen;
 * - signed out: the login page (`LoginPage`), with the reason when a session
 *   just ended, and the tab's live socket stopped;
 * - signed in: `GET /api/me` for the account and its Ideas inbox, then the app
 *   (with the account in `MeContext`);
 * - the session answer failing: "Can't reach Satchel", with Retry.
 *
 * Any API call that hits a 401 asks the hooks to look again (`ward.ts`), so a
 * session that ends while the app is open lands on the login page too.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const signedOut = session.status === "signed_out";

  // The session is gone: the socket would only be refused.
  useEffect(() => {
    if (signedOut) live.stop();
  }, [signedOut]);

  switch (session.status) {
    case "loading":
      return <GateScreen state={{ kind: "checking" }} onRetry={() => {}} />;
    case "error":
      return <GateScreen state={{ kind: "unreachable" }} onRetry={() => void session.refresh()} />;
    case "signed_out":
      return <LoginPage />;
    case "signed_in":
      return <SignedInGate key={session.user.id}>{children}</SignedInGate>;
  }
}

/** Signed in: fetch the account, keep asking if the API can't be reached, then render the app. */
function SignedInGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: "checking" });

  useEffect(() => {
    let current = true;
    void checkSession().then((next) => {
      if (current) setState(next);
    });
    return () => {
      current = false;
    };
  }, []);

  const signedIn = state.kind === "signed-in";
  useEffect(() => {
    if (signedIn) void rebindPushSubscription();
  }, [signedIn]);

  // Offline: ask again on its own when the device comes back online or the
  // app is shown again, so nobody has to find the Retry button.
  const waiting = state.kind === "unreachable";
  useEffect(() => {
    if (!waiting) return;
    let checking = false;
    const retry = () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      void checkSession().then((next) => {
        checking = false;
        setState(next);
      });
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [waiting]);

  if (state.kind === "signed-in") {
    return <MeContext value={state.me}>{children}</MeContext>;
  }

  return (
    <GateScreen
      state={state}
      onRetry={() => {
        setState({ kind: "checking" });
        void checkSession().then(setState);
      }}
    />
  );
}

export interface GateScreenProps {
  state: Exclude<GateState, { kind: "signed-in" }>;
  onRetry: () => void;
}

/** Everything the gate shows instead of the app and the login page. Pure, so it renders in tests. */
export function GateScreen({ state, onRetry }: GateScreenProps) {
  switch (state.kind) {
    case "checking":
      return (
        <Gate busy>
          <p className="gate__message">Loading…</p>
        </Gate>
      );
    case "unreachable":
      return (
        <Gate title="Can’t reach Satchel">
          <p className="gate__message" role="alert">
            Satchel isn&rsquo;t answering. Check your connection and try again.
          </p>
          <div className="gate__actions">
            <button type="button" className="button" onClick={onRetry}>
              Retry
            </button>
          </div>
        </Gate>
      );
  }
}

function Gate({ title, busy = false, children }: { title?: string; busy?: boolean; children: ReactNode }) {
  return (
    <main className="gate" aria-busy={busy || undefined}>
      <div className="gate__panel">
        <span className="mark" aria-hidden="true">
          S
        </span>
        <h1 className={title ? "gate__title" : "visually-hidden"}>{title ?? "Satchel"}</h1>
        {children}
      </div>
    </main>
  );
}

/** Signs out of Satchel. A shared browser must stop showing this account's previews first, so the push subscription goes before the session does. */
export function SignOutButton({ className = "button button--danger" }: { className?: string }) {
  const { logout, pending } = useLogout();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        void forgetPushSubscription()
          .catch(() => undefined)
          .then(() => logout());
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

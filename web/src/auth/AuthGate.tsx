import { useEffect, useState, type ReactNode } from "react";
import { onAuthEvent } from "../api";
import { goToWardLogin, signOut, startRenewal } from "../ward";
import { checkSession, MeContext, type GateState } from "./session";

/**
 * The session gate around the whole app. On load it asks `GET /api/me`:
 * signed in renders the app (with the account in `MeContext`) and keeps the
 * session renewed; anything else renders one of the screens below. Any later
 * API call that hits a 403 or a failed renewal flips the gate too.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: "checking" });

  useEffect(() => {
    let live = true;
    void checkSession().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(
    () =>
      onAuthEvent((event) => {
        setState(event === "no-access" ? { kind: "no-access" } : { kind: "signed-out" });
      }),
    [],
  );

  const signedIn = state.kind === "signed-in";
  useEffect(() => {
    if (!signedIn) return;
    return startRenewal();
  }, [signedIn]);

  // Offline or sign-in down: ask again on its own when the device comes back
  // online or the app is shown again, so nobody has to find the Retry button.
  const waiting = state.kind === "unreachable" || state.kind === "unavailable";
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

/** Everything the gate shows instead of the app. Pure, so it renders in tests. */
export function GateScreen({ state, onRetry }: GateScreenProps) {
  switch (state.kind) {
    case "checking":
      return (
        <Gate busy>
          <p className="gate__message">Loading…</p>
        </Gate>
      );
    case "signed-out":
      return (
        <Gate>
          <p className="gate__message" role="status">
            Taking you to sign in…
          </p>
          <div className="gate__actions">
            {/* In case the automatic navigation didn't happen. */}
            <button type="button" className="button button--quiet" onClick={() => goToWardLogin()}>
              Sign in
            </button>
          </div>
        </Gate>
      );
    case "no-access":
      return (
        <Gate title="No access">
          <p className="gate__message" role="alert">
            Your account doesn&rsquo;t have access to Satchel. Ask the owner to add you.
          </p>
          <div className="gate__actions">
            <SignOutButton />
          </div>
        </Gate>
      );
    case "unavailable":
      return (
        <Gate title="Sign-in is down">
          <p className="gate__message" role="alert">
            Satchel can&rsquo;t reach sign-in right now.
          </p>
          <div className="gate__actions">
            <button type="button" className="button" onClick={onRetry}>
              Retry
            </button>
          </div>
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

/** Ends the Ward session and goes to Ward's login page. */
export function SignOutButton({ className = "button button--danger" }: { className?: string }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={leaving}
      onClick={() => {
        setLeaving(true);
        void signOut();
      }}
    >
      {leaving ? "Signing out…" : "Sign out"}
    </button>
  );
}

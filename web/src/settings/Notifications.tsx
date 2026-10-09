import { useEffect, useId, useState } from "react";
import { ApiError, deletePushSubscription, getPushKey, savePushSubscription, SignedOut } from "../api";
import {
  base64UrlToBytes,
  isIos,
  pushRegistration,
  pushSupport,
  readEnvironment,
  sameKey,
  subscribeWith,
  subscriptionBody,
} from "../push/subscription";
import "../push/notifications.css";

/** What the card shows. `ready` is the only state with a working switch. */
export type NotificationsView =
  | { kind: "loading" }
  | { kind: "ios-home-screen" }
  | { kind: "ios-update" }
  | { kind: "unsupported" }
  | { kind: "server-off" }
  /** Couldn't check (a network error, say); worth another try. */
  | { kind: "check-failed" }
  | { kind: "ready"; on: boolean; permission: NotificationPermission; publicKey: string; ios: boolean };

export const IOS_HOME_SCREEN_MESSAGE =
  "Add Satchel to your Home Screen first (Share → Add to Home Screen), then turn this on there.";

/** How to undo a "Block", where the browser keeps it. */
export function deniedHelp(ios: boolean): string {
  return ios
    ? "Notifications are blocked for Satchel. Turn them back on in the iPhone's Settings → Notifications → Satchel, then come back here."
    : "Notifications are blocked for Satchel in this browser. Allow them in the browser's site settings (on a computer, the icon at the left of the address bar; on Android, Chrome's ⋮ menu → Settings → Site settings → Notifications), then come back here.";
}

const SWITCH_LABEL = "New messages";

function errorMessage(error: unknown, turningOn: boolean): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof DOMException) return "This browser couldn't set up notifications. Try again later.";
  return turningOn ? "Couldn't turn notifications on. Try again." : "Couldn't turn notifications off. Try again.";
}

export interface NotificationsCardProps {
  view: NotificationsView;
  busy?: boolean;
  /** A failure to show under the switch. */
  error?: string | null;
  /** A quieter line, e.g. the permission prompt was dismissed. */
  note?: string | null;
  onToggle?: (on: boolean) => void;
  onRetry?: () => void;
}

/** The card itself, without the browser: `Notifications` feeds it. */
export function NotificationsCard({ view, busy = false, error = null, note = null, onToggle, onRetry }: NotificationsCardProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const hintId = `${id}-hint`;
  return (
    <section className="card" aria-labelledby={titleId} aria-busy={view.kind === "loading" || busy}>
      <h3 className="card__title" id={titleId}>
        Notifications
      </h3>
      {view.kind === "loading" && <p className="muted">Checking this device…</p>}
      {view.kind === "ios-home-screen" && <p className="notify-hint">{IOS_HOME_SCREEN_MESSAGE}</p>}
      {view.kind === "ios-update" && (
        <p className="notify-hint">Notifications need iOS 16.4 or later. Update the iPhone, then turn this on here.</p>
      )}
      {view.kind === "unsupported" && <p className="muted">This browser can't show notifications from Satchel.</p>}
      {view.kind === "check-failed" && (
        <>
          <p className="muted">Couldn't check notifications. Try again.</p>
          <button type="button" className="button button--quiet" onClick={onRetry}>
            Retry
          </button>
        </>
      )}
      {view.kind === "server-off" && <p className="muted">Notifications aren't set up on this Satchel server yet.</p>}
      {view.kind === "ready" && (
        <>
          <label className="notify-switch">
            <span className="notify-switch__text">
              <span className="notify-switch__label">{SWITCH_LABEL}</span>
              <span className="muted" id={hintId}>
                Notify this device when someone writes to you.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={view.on}
              aria-checked={view.on}
              aria-describedby={hintId}
              disabled={busy || view.permission === "denied"}
              onChange={(event) => onToggle?.(event.currentTarget.checked)}
            />
          </label>
          {view.permission === "denied" && <p className="notify-hint">{deniedHelp(view.ios)}</p>}
        </>
      )}
      {note && <p className="muted">{note}</p>}
      {error && (
        <p className="notify-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Works out the card's state from this device, the browser and the server. */
async function loadView(): Promise<NotificationsView> {
  const env = readEnvironment();
  const support = pushSupport(env);
  if (support !== "ok") return { kind: support };

  let publicKey: string;
  try {
    ({ publicKey } = await getPushKey());
  } catch (error) {
    if (error instanceof ApiError && error.code === "not_found") return { kind: "server-off" };
    throw error;
  }

  const registration = await pushRegistration();
  if (registration === null) return { kind: "unsupported" };
  const permission = Notification.permission;
  const subscription = await registration.pushManager.getSubscription();
  const on =
    permission === "granted" &&
    subscription !== null &&
    sameKey(subscription.options.applicationServerKey, base64UrlToBytes(publicKey));
  if (on) {
    // Save it again: the server binds it to whoever is signed in now (a shared
    // laptop that switched accounts) and learns it back if it lost it.
    const body = subscriptionBody(subscription.toJSON());
    if (body) savePushSubscription(body).catch(() => undefined);
  }
  return { kind: "ready", on, permission, publicKey, ios: isIos(env) };
}

/**
 * Settings → Notifications (brief 14). A switch that asks for permission only
 * when turned on. Turning it on subscribes this browser and saves the
 * subscription on the server; turning it off unsubscribes and deletes it.
 */
export function Notifications() {
  const [view, setView] = useState<NotificationsView>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const check = () => {
      loadView().then(
        (next) => {
          if (live) setView(next);
        },
        (e: unknown) => {
          // A failed re-check leaves a working switch as it was.
          if (live && !(e instanceof SignedOut)) setView((current) => (current.kind === "ready" ? current : { kind: "check-failed" }));
        },
      );
    };
    check();
    // Back from the browser's settings (a Block lifted, say): look again.
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [attempt]);

  if (view.kind !== "ready") {
    return (
      <NotificationsCard
        view={view}
        error={error}
        onRetry={() => {
          setView({ kind: "loading" });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }

  const turnOn = async () => {
    // First thing in the click, before any other await: browsers only show
    // the permission prompt during the user's gesture.
    const asked = Notification.permission === "granted" ? Promise.resolve("granted" as const) : Notification.requestPermission();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const permission = await asked;
      if (permission !== "granted") {
        setView({ ...view, on: false, permission });
        if (permission === "default") setNote("Satchel needs your permission to notify you. Turn this on again to be asked.");
        return;
      }
      const registration = await pushRegistration();
      if (registration === null) {
        setView({ kind: "unsupported" });
        return;
      }
      const subscription = await subscribeWith(registration, view.publicKey);
      const body = subscriptionBody(subscription.toJSON());
      if (body === null) throw new Error("The browser's subscription has no keys.");
      try {
        await savePushSubscription(body);
      } catch (e) {
        // The server doesn't know it, so nothing would arrive: don't leave it half on.
        await subscription.unsubscribe().catch(() => undefined);
        throw e;
      }
      setView({ ...view, on: true, permission });
    } catch (e) {
      if (!(e instanceof SignedOut)) setError(errorMessage(e, true));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const registration = await pushRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription !== null) {
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        // Best effort: if this misses, the push service's 410 removes the row later.
        await deletePushSubscription(endpoint).catch(() => undefined);
      }
      setView({ ...view, on: false });
    } catch (e) {
      if (!(e instanceof SignedOut)) setError(errorMessage(e, false));
    } finally {
      setBusy(false);
    }
  };

  return (
    <NotificationsCard
      view={view}
      busy={busy}
      error={error}
      note={note}
      onToggle={(on) => void (on ? turnOn() : turnOff())}
    />
  );
}

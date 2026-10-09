import type { ComponentType } from "react";
import { SignOutButton } from "../auth/AuthGate";
import { useMe } from "../auth/session";
import { Avatar } from "../layout/Avatar";
import { ScreenHeader } from "../layout/ScreenHeader";

/**
 * The Connect Claude slot. Brief 09 adds `./ConnectClaude.tsx` exporting
 * `ConnectClaude` (no props; it calls the API client itself) and it appears
 * under the account card with no change here. Until then the glob matches
 * nothing and the slot stays empty. Once the file exists, a plain
 * `import { ConnectClaude } from "./ConnectClaude"` can replace this.
 */
const slot = import.meta.glob<{ ConnectClaude?: ComponentType }>("./ConnectClaude.tsx", { eager: true });
const ConnectClaude = Object.values(slot)[0]?.ConnectClaude;

/** Settings: who is signed in, Sign out, and Connect Claude. */
export function Settings() {
  const me = useMe();
  return (
    <section className="screen">
      <ScreenHeader title="Settings" large />
      <div className="screen__body">
        <div className="settings">
          <section className="card" aria-labelledby="settings-account">
            <h3 className="card__title" id="settings-account">
              Account
            </h3>
            <div className="account">
              <Avatar name={me.displayName} size="lg" />
              <div className="account__text">
                <p className="account__name">{me.displayName}</p>
                <p className="muted">Signed in with Ward</p>
              </div>
            </div>
            <div className="account__actions">
              <SignOutButton />
            </div>
          </section>
          {ConnectClaude && <ConnectClaude />}
        </div>
      </div>
    </section>
  );
}

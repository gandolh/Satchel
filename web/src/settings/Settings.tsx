import type { ComponentType } from "react";
import { SignOutButton } from "../auth/AuthGate";
import { useMe } from "../auth/session";
import { Avatar } from "../layout/Avatar";
import { ScreenHeader } from "../layout/ScreenHeader";
import { Notifications } from "./Notifications";
import { SignInMethods } from "./SignInMethods";
import { ThemeSwitch } from "./ThemeSwitch";
import { Card } from "../layout/Card";
import { safeX, screen, screenBody } from "../layout/looks";
import { cn } from "../lib/cn";

/**
 * The Connect Claude slot. `./ConnectClaude.tsx` exports `ConnectClaude`
 * (no props; it calls the API client itself), and it appears
 * under the account card with no change here. Until then the glob matches
 * nothing and the slot stays empty. Once the file exists, a plain
 * `import { ConnectClaude } from "./ConnectClaude"` can replace this.
 */
const slot = import.meta.glob<{ ConnectClaude?: ComponentType }>("./ConnectClaude.tsx", { eager: true });
const ConnectClaude = Object.values(slot)[0]?.ConnectClaude;

/** Settings: who is signed in, Sign out, how this account signs in, Notifications, and Connect Claude (the owner only). */
export function Settings() {
  const me = useMe();
  return (
    <section className={screen}>
      <ScreenHeader title="Settings" large />
      <div className={screenBody}>
        <div className={cn("mx-auto grid w-full max-w-160 content-start gap-4 p-4 wide:px-6 wide:py-8", safeX)}>
          <Card title="Account" titleId="settings-account">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={me.displayName} size="lg" />
              <div className="grid min-w-0 gap-0.5">
                <p className="overflow-hidden font-title text-title font-semibold text-ellipsis whitespace-nowrap">
                  {me.displayName}
                </p>
                <p className="text-muted">{me.inboxId === null ? "Friend" : "Owner"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <SignOutButton />
            </div>
          </Card>
          <SignInMethods />
          <Notifications />
          <ThemeSwitch />
          {ConnectClaude && <ConnectClaude />}
        </div>
      </div>
    </section>
  );
}

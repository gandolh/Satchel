import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IOS_HOME_SCREEN_MESSAGE, NotificationsCard, deniedHelp, type NotificationsView } from "./Notifications";

/** The Notifications card in each state, rendered without a browser. */

function render(view: NotificationsView, extra: { busy?: boolean; error?: string; note?: string } = {}): string {
  return renderToStaticMarkup(createElement(NotificationsCard, { view, ...extra }));
}

const ready = (on: boolean, permission: NotificationPermission = "granted", ios = false): NotificationsView => ({
  kind: "ready",
  on,
  permission,
  publicKey: "BPUB",
  ios,
});

describe("NotificationsCard", () => {
  it("tells an iPhone in Safari to add Satchel to the Home Screen first, with no switch", () => {
    const html = render({ kind: "ios-home-screen" });
    expect(IOS_HOME_SCREEN_MESSAGE).toBe(
      "Add Satchel to your Home Screen first (Share → Add to Home Screen), then turn this on there.",
    );
    expect(html).toContain(IOS_HOME_SCREEN_MESSAGE);
    expect(html).not.toContain('role="switch"');
  });

  it("offers a retry, not 'unsupported', when the check itself failed", () => {
    const html = render({ kind: "check-failed" });
    expect(html).toContain("Couldn&#x27;t check notifications. Try again.");
    expect(html).toContain("Retry");
    expect(html).not.toContain("can&#x27;t show notifications");
    expect(html).not.toContain('role="switch"');
  });

  it("says so when the server has push off, or the browser can't", () => {
    expect(render({ kind: "server-off" })).toContain("aren&#x27;t set up on this Satchel server");
    expect(render({ kind: "unsupported" })).toContain("can&#x27;t show notifications");
    expect(render({ kind: "ios-update" })).toContain("iOS 16.4");
  });

  it("shows the switch off, then on", () => {
    const off = render(ready(false));
    expect(off).toContain('role="switch"');
    expect(off).toContain('aria-checked="false"');
    expect(off).not.toContain("disabled");
    const on = render(ready(true));
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('checked=""');
  });

  it("disables the switch while busy", () => {
    expect(render(ready(false), { busy: true })).toContain('disabled=""');
  });

  it("explains how to re-enable a block, for a computer or Android and for an iPhone", () => {
    const blocked = render(ready(false, "denied"));
    expect(blocked).toContain('disabled=""');
    expect(blocked).toContain("site settings");
    expect(render(ready(false, "denied", true))).toContain("Settings → Notifications → Satchel");
    expect(deniedHelp(false)).not.toBe(deniedHelp(true));
  });

  it("shows an error as an alert and a note quietly", () => {
    const html = render(ready(false), { error: "Couldn't turn notifications on. Try again.", note: "Satchel needs your permission." });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Satchel needs your permission.");
  });
});

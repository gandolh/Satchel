import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, SignedOut } from "../errors";
import { GateScreen } from "./AuthGate";
import { LoginView, type LoginViewProps } from "./LoginPage";
import { loginMessage, sessionReasonMessage, settingsMessage, wardSignInMessage } from "./messages";
import { checkSession } from "./session";

/**
 * The gate without a browser: the account probe, the screens it shows, and the
 * login page's words. The session state itself is the vendored hooks'.
 */

function renderGate(state: Parameters<typeof GateScreen>[0]["state"]): string {
  return renderToStaticMarkup(createElement(GateScreen, { state, onRetry: () => {} }));
}

function renderLogin(props: Partial<LoginViewProps> = {}): string {
  return renderToStaticMarkup(createElement(LoginView, { wardEnabled: true, ...props }));
}

describe("checkSession", () => {
  beforeEach(() => {
    vi.stubEnv("BASE_URL", "/satchel/");
    vi.stubGlobal("window", { location: { pathname: "/satchel/" } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is signed in with the account", async () => {
    const me = { subject: "s", displayName: "owner", inboxId: "i" };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(me)));
    await expect(checkSession()).resolves.toEqual({ kind: "signed-in", me });
  });

  it("stays checking when the API says the session ended, since the login page is taking over", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "unauthorized" }, { status: 401 })));
    await expect(checkSession()).resolves.toEqual({ kind: "checking" });
  });

  it("is unreachable when Satchel does not answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    await expect(checkSession()).resolves.toEqual({ kind: "unreachable" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 502 })));
    await expect(checkSession()).resolves.toEqual({ kind: "unreachable" });
  });

  it("knows the errors it is told apart by", () => {
    expect(new SignedOut()).toBeInstanceOf(Error);
    expect(new NetworkError(new TypeError("x"))).toBeInstanceOf(Error);
    expect(new ApiError(500, "internal", "boom").code).toBe("internal");
  });
});

describe("GateScreen", () => {
  it("says Loading while it asks", () => {
    expect(renderGate({ kind: "checking" })).toContain("Loading…");
  });

  it("offers Retry when Satchel is unreachable", () => {
    const html = renderGate({ kind: "unreachable" });
    expect(html).toContain("Satchel isn’t answering.");
    expect(html).toContain(">Retry</button>");
  });
});

describe("LoginView", () => {
  it("has a username, a password and Sign in, and the Ward button when the server has Ward", () => {
    const html = renderLogin();
    expect(html).toContain("Sign in to Satchel");
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('type="password"');
    expect(html).toContain(">Sign in</button>");
    expect(html).toContain(">Sign in with Ward</button>");
  });

  it("has no register link and, with Ward not configured, no Ward button", () => {
    const html = renderLogin({ wardEnabled: false });
    expect(html).not.toContain("Sign in with Ward");
    expect(html.toLowerCase()).not.toContain("register");
    expect(html.toLowerCase()).not.toContain("create account");
  });

  it("says why a Ward session ended, and points to the password", () => {
    expect(renderLogin({ reason: "ward_unavailable" })).toContain("Ward is unreachable right now. Sign in with your password.");
    expect(renderLogin({ reason: "ward_session_ended" })).toContain("Your Ward session ended. Sign in again.");
    // A plain sign-out says nothing.
    expect(renderLogin({})).not.toContain("role=\"status\"");
  });

  it("shows Satchel's own words for a Ward refusal, not a code", () => {
    const html = renderLogin({ wardError: { code: "access_denied" } });
    expect(html).toContain("Ward didn’t let you in here. Ask the owner for access.");
    expect(html).not.toContain("access_denied");
  });

  it("shows a failed password sign-in", () => {
    expect(renderLogin({ error: { code: "invalid_credentials" } })).toContain("That username and password don’t match.");
  });
});

describe("messages", () => {
  it("says how long to wait after too many tries", () => {
    expect(loginMessage({ code: "too_many_attempts", retryAfterSeconds: 45 })).toBe("Too many tries. Wait 45 seconds, then try again.");
    expect(loginMessage({ code: "too_many_attempts", retryAfterSeconds: 600 })).toBe("Too many tries. Wait 10 minutes, then try again.");
  });

  it("covers every code the Ward round trip can come back with", () => {
    for (const code of ["access_denied", "ward_unavailable", "ward_misconfigured", "invalid_callback", "network", "something_new"]) {
      expect(wardSignInMessage({ code }).length).toBeGreaterThan(10);
    }
    expect(wardSignInMessage({ code: "something_new" })).toBe("Couldn’t sign in with Ward. Try again.");
  });

  it("covers the settings codes, and falls back on an unknown one", () => {
    for (const code of [
      "already_linked",
      "ward_account_in_use",
      "ward_account_mismatch",
      "no_local_password",
      "not_linked",
      "reauthentication_required",
      "invalid_credentials",
      "password_too_short",
    ]) {
      expect(settingsMessage({ code })).not.toBe("Something went wrong. Try again.");
    }
    expect(settingsMessage({ code: "never_heard_of_it" })).toBe("Something went wrong. Try again.");
  });

  it("session reasons that mean nothing say nothing", () => {
    expect(sessionReasonMessage(undefined)).toBeNull();
    expect(sessionReasonMessage("session_check_failed")).toBeNull();
  });
});

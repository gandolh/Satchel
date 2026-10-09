import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, NoAccess, SignedOut, Unavailable } from "../errors";
import { GateScreen, type GateScreenProps } from "./AuthGate";
import { checkSession, gateStateForError } from "./session";

/**
 * The no-access path end to end without a browser: a 403 from `GET /api/me`
 * becomes the `no-access` state, and that state renders the brief's sentence
 * with a Sign out button and no redirect.
 */

function render(state: GateScreenProps["state"]): string {
  return renderToStaticMarkup(createElement(GateScreen, { state, onRetry: () => {} }));
}

describe("gateStateForError", () => {
  it("maps each failure to its screen", () => {
    expect(gateStateForError(new NoAccess())).toEqual({ kind: "no-access" });
    expect(gateStateForError(new Unavailable())).toEqual({ kind: "unavailable" });
    expect(gateStateForError(new SignedOut())).toEqual({ kind: "signed-out" });
    expect(gateStateForError(new NetworkError(new TypeError("offline")))).toEqual({ kind: "unreachable" });
    expect(gateStateForError(new ApiError(500, "internal", "boom"))).toEqual({ kind: "unreachable" });
  });
});

describe("checkSession", () => {
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    assign = vi.fn();
    vi.stubEnv("BASE_URL", "/satchel/");
    vi.stubGlobal("window", { location: { pathname: "/satchel/", assign } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is no-access, without a redirect, when /api/me answers 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "forbidden", message: "This Ward account has no access to Satchel." } },
          { status: 403 },
        ),
      ),
    );
    await expect(checkSession()).resolves.toEqual({ kind: "no-access" });
    expect(assign).not.toHaveBeenCalled();
  });

  it("is unavailable when /api/me answers 503", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { code: "unavailable", message: "Ward is down" } }, { status: 503 })),
    );
    await expect(checkSession()).resolves.toEqual({ kind: "unavailable" });
  });

  it("is signed in with the account", async () => {
    const me = { subject: "s", displayName: "owner", inboxId: "i" };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(me)));
    await expect(checkSession()).resolves.toEqual({ kind: "signed-in", me });
  });
});

describe("GateScreen", () => {
  it("tells an account without a grant to ask the owner, and offers Sign out", () => {
    const html = render({ kind: "no-access" });
    expect(html).toContain("Your account doesn’t have access to Satchel. Ask the owner to add you.");
    expect(html).toContain(">Sign out</button>");
    expect(html).not.toContain("Retry");
  });

  it("offers Retry when sign-in is down", () => {
    const html = render({ kind: "unavailable" });
    expect(html).toContain("Satchel can’t reach sign-in right now.");
    expect(html).toContain(">Retry</button>");
  });

  it("offers a manual Sign in while the redirect happens", () => {
    expect(render({ kind: "signed-out" })).toContain(">Sign in</button>");
  });
});

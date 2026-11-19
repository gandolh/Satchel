import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../../vendor/ward/ward-auth-react.js";
import { settingsMessage } from "../auth/messages";

/**
 * The settings page's calls without a browser: linking and unlinking Ward carry
 * the typed password, and a refusal comes back as words, not a redirect.
 */

function client(fetchMock: typeof fetch, navigate = vi.fn()) {
  return createAuthClient({ basePath: "/satchel/api/auth", fetch: fetchMock, navigate });
}

describe("link and unlink Ward", () => {
  it("send the current password in the body", async () => {
    const fetchMock = vi.fn(async () => Response.json({ url: "https://ward.example/auth?x=1" }));
    const navigate = vi.fn();
    await client(fetchMock, navigate).startWardLink("hunter22 password");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/satchel/api/auth/ward/link");
    expect(JSON.parse(String(init.body))).toEqual({ currentPassword: "hunter22 password" });
    expect(navigate).toHaveBeenCalledWith("https://ward.example/auth?x=1");

    const unlinkMock = vi.fn(async () => Response.json({}));
    await client(unlinkMock).unlinkWard("hunter22 password");
    const [unlinkUrl, unlinkInit] = unlinkMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(unlinkUrl).toBe("/satchel/api/auth/ward/unlink");
    expect(JSON.parse(String(unlinkInit.body))).toEqual({ currentPassword: "hunter22 password" });
  });

  it("a wrong password stays on the page and says so", async () => {
    const navigate = vi.fn();
    const result = await client(
      vi.fn(async () => Response.json({ error: "invalid_credentials" }, { status: 401 })),
      navigate,
    ).startWardLink("nope");
    expect(result.ok).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    if (result.ok) throw new Error("expected a refusal");
    expect(settingsMessage(result.error)).toBe("That isn’t your current password.");
  });

  it("says how long to wait after too many tries", () => {
    expect(settingsMessage({ code: "too_many_attempts", retryAfterSeconds: 120 })).toContain("2 minutes");
  });
});

describe("the username screen's words", () => {
  it("name a taken name and a refused one", () => {
    expect(settingsMessage({ code: "username_taken" })).toContain("taken");
    expect(settingsMessage({ code: "invalid_username" })).toContain("can’t be used");
  });
});

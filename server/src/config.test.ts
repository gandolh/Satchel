import { createECDH } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, pushOffMessage } from "./config.js";

const ENV = { PUBLIC_ORIGIN: "http://localhost:5175" };

function problems(env: NodeJS.ProcessEnv): string {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).message;
  }
  throw new Error("expected loadConfig to throw");
}

describe("loadConfig", () => {
  it("defaults HOST, PORT, DATA_DIR, the API prefix and the web base", () => {
    expect(loadConfig({ ...ENV })).toEqual({
      host: "127.0.0.1",
      port: 8807,
      dataDir: "./data",
      publicOrigin: "http://localhost:5175",
      apiPrefix: "/satchel-api",
      webBase: "/satchel/",
      push: { enabled: false, missing: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] },
    });
  });

  it("reads HOST, PORT and DATA_DIR", () => {
    const config = loadConfig({ ...ENV, HOST: "0.0.0.0", PORT: "8795", DATA_DIR: "/data" });
    expect(config).toMatchObject({ host: "0.0.0.0", port: 8795, dataDir: "/data" });
  });

  it("takes the public origin from the Ward redirect URI when PUBLIC_ORIGIN is not set", () => {
    const config = loadConfig({ WARD_OIDC_REDIRECT_URI: "https://example.com/satchel-api/auth/ward/callback" });
    expect(config.publicOrigin).toBe("https://example.com");
    // An explicit one wins.
    expect(loadConfig({ ...ENV, WARD_OIDC_REDIRECT_URI: "https://example.com/x" }).publicOrigin).toBe("http://localhost:5175");
  });

  it("names PUBLIC_ORIGIN when there is no way to know the origin", () => {
    expect(problems({})).toContain("PUBLIC_ORIGIN is not set");
    expect(problems({ PUBLIC_ORIGIN: "" })).toContain("PUBLIC_ORIGIN is not set");
  });

  it("does not read the old Ward variables", () => {
    const old = { WARD_PUBLIC_ORIGIN: "https://example.com", WARD_API_BASE_PATH: "/ward-api", WARD_APP_KEY: "x" };
    expect(problems(old)).toContain("PUBLIC_ORIGIN is not set");
    expect(loadConfig({ ...ENV, ...old }).publicOrigin).toBe("http://localhost:5175");
  });

  it("wants a bare origin, a prefix without a trailing slash and a base with both slashes", () => {
    expect(problems({ PUBLIC_ORIGIN: "https://example.com/" })).toContain("PUBLIC_ORIGIN");
    expect(problems({ ...ENV, SATCHEL_API_PREFIX: "/satchel-api/" })).toContain("SATCHEL_API_PREFIX");
    expect(problems({ ...ENV, SATCHEL_BASE: "/satchel" })).toContain("SATCHEL_BASE");
    expect(loadConfig({ ...ENV, SATCHEL_API_PREFIX: "/api", SATCHEL_BASE: "/" })).toMatchObject({
      apiPrefix: "/api",
      webBase: "/",
    });
  });

  it("refuses a PORT that is not a port", () => {
    expect(problems({ ...ENV, PORT: "eighty" })).toContain("PORT");
    expect(problems({ ...ENV, PORT: "70000" })).toContain("PORT");
  });
});

/** A fresh VAPID pair, made here so no key sits in the repo. */
function vapidPair(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: ecdh.getPublicKey("base64url"), privateKey: ecdh.getPrivateKey().toString("base64url") };
}

describe("loadConfig push settings", () => {
  const pair = vapidPair();
  const VAPID = {
    VAPID_PUBLIC_KEY: pair.publicKey,
    VAPID_PRIVATE_KEY: pair.privateKey,
    VAPID_SUBJECT: "mailto:johndoe@example.com",
  };

  it("turns push on with all three", () => {
    expect(loadConfig({ ...ENV, ...VAPID }).push).toEqual({
      enabled: true,
      vapid: { publicKey: pair.publicKey, privateKey: pair.privateKey, subject: "mailto:johndoe@example.com" },
    });
  });

  it("leaves push off, naming what is missing, with none or only some (empty counts as missing)", () => {
    expect(loadConfig({ ...ENV }).push).toEqual({
      enabled: false,
      missing: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
    });
    expect(loadConfig({ ...ENV, ...VAPID, VAPID_PRIVATE_KEY: "" }).push).toEqual({
      enabled: false,
      missing: ["VAPID_PRIVATE_KEY"],
    });
    expect(loadConfig({ ...ENV, VAPID_SUBJECT: VAPID.VAPID_SUBJECT }).push).toEqual({
      enabled: false,
      missing: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"],
    });
  });

  it("says why push is off in one line", () => {
    expect(pushOffMessage(["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"])).toBe(
      'Push notifications are off: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT are not set. See "Push notifications" in the README.',
    );
    expect(pushOffMessage(["VAPID_SUBJECT"])).toContain("VAPID_SUBJECT is not set (all three VAPID settings are needed)");
  });

  it("refuses malformed keys and subjects without echoing a key", () => {
    const bad = problems({ ...ENV, ...VAPID, VAPID_PRIVATE_KEY: `${pair.privateKey}x`, VAPID_PUBLIC_KEY: "short" });
    expect(bad).toContain("VAPID_PUBLIC_KEY must be");
    expect(bad).toContain("VAPID_PRIVATE_KEY must be");
    expect(bad).not.toContain(pair.privateKey);
    expect(problems({ ...ENV, ...VAPID, VAPID_SUBJECT: "johndoe@example.com" })).toContain("VAPID_SUBJECT must be");
    expect(problems({ ...ENV, ...VAPID, VAPID_SUBJECT: "http://example.com" })).toContain("VAPID_SUBJECT must be");
    expect(loadConfig({ ...ENV, ...VAPID, VAPID_SUBJECT: "https://gandolh.ro/satchel/" }).push.enabled).toBe(true);
  });

  it.each([
    ["an empty mailto: address", "mailto:"],
    ["a mailto: with only a query", "mailto:?subject=push"],
    ["a mailto: with no domain", "mailto:johndoe@"],
    ["a mailto: with no local part", "mailto:@example.com"],
    ["a mailto: with no @", "mailto:johndoe"],
    ["an https: URL with no host", "https://"],
  ])("refuses %s as VAPID_SUBJECT", (_label, subject) => {
    expect(problems({ ...ENV, ...VAPID, VAPID_SUBJECT: subject })).toContain("VAPID_SUBJECT must be");
  });

  it("refuses two keys that aren't one pair", () => {
    const other = vapidPair();
    const message = problems({ ...ENV, ...VAPID, VAPID_PUBLIC_KEY: other.publicKey });
    expect(message).toContain("not one pair");
    expect(message).not.toContain(pair.privateKey);
  });
});

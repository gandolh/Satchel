import { createECDH } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, pushOffMessage } from "./config.js";

const WARD = {
  WARD_PUBLIC_ORIGIN: "http://localhost:8792",
  WARD_API_BASE_PATH: "/ward-api",
  WARD_APP_KEY: "wak_example",
};

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
  it("defaults HOST, PORT and DATA_DIR", () => {
    expect(loadConfig({ ...WARD })).toEqual({
      host: "127.0.0.1",
      port: 8807,
      dataDir: "./data",
      ward: { publicOrigin: "http://localhost:8792", apiBasePath: "/ward-api", appKey: "wak_example" },
      push: { enabled: false, missing: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] },
    });
  });

  it("reads HOST, PORT and DATA_DIR", () => {
    const config = loadConfig({ ...WARD, HOST: "0.0.0.0", PORT: "8795", DATA_DIR: "/data" });
    expect(config).toMatchObject({ host: "0.0.0.0", port: 8795, dataDir: "/data" });
  });

  it("names each missing Ward key and says the seed writes it", () => {
    const message = problems({ WARD_PUBLIC_ORIGIN: WARD.WARD_PUBLIC_ORIGIN });
    expect(message).toContain("WARD_API_BASE_PATH is not set");
    expect(message).toContain("WARD_APP_KEY is not set");
    expect(message).toContain("seed.mjs");
    expect(message).not.toContain("WARD_PUBLIC_ORIGIN");
  });

  it("treats an empty value as not set", () => {
    expect(problems({ ...WARD, WARD_APP_KEY: "" })).toContain("WARD_APP_KEY is not set");
  });

  it("wants a bare origin", () => {
    expect(problems({ ...WARD, WARD_PUBLIC_ORIGIN: "https://gandolh.ro/" })).toContain("WARD_PUBLIC_ORIGIN");
    expect(problems({ ...WARD, WARD_PUBLIC_ORIGIN: "https://gandolh.ro/ward" })).toContain("WARD_PUBLIC_ORIGIN");
  });

  it("wants a base path with a leading slash and no trailing slash", () => {
    expect(problems({ ...WARD, WARD_API_BASE_PATH: "ward-api" })).toContain("WARD_API_BASE_PATH");
    expect(problems({ ...WARD, WARD_API_BASE_PATH: "/ward-api/" })).toContain("WARD_API_BASE_PATH");
  });

  it("refuses a PORT that is not a port", () => {
    expect(problems({ ...WARD, PORT: "eighty" })).toContain("PORT");
    expect(problems({ ...WARD, PORT: "70000" })).toContain("PORT");
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
    expect(loadConfig({ ...WARD, ...VAPID }).push).toEqual({
      enabled: true,
      vapid: { publicKey: pair.publicKey, privateKey: pair.privateKey, subject: "mailto:johndoe@example.com" },
    });
  });

  it("leaves push off, naming what is missing, with none or only some (empty counts as missing)", () => {
    expect(loadConfig({ ...WARD }).push).toEqual({
      enabled: false,
      missing: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
    });
    expect(loadConfig({ ...WARD, ...VAPID, VAPID_PRIVATE_KEY: "" }).push).toEqual({
      enabled: false,
      missing: ["VAPID_PRIVATE_KEY"],
    });
    expect(loadConfig({ ...WARD, VAPID_SUBJECT: VAPID.VAPID_SUBJECT }).push).toEqual({
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
    const bad = problems({ ...WARD, ...VAPID, VAPID_PRIVATE_KEY: `${pair.privateKey}x`, VAPID_PUBLIC_KEY: "short" });
    expect(bad).toContain("VAPID_PUBLIC_KEY must be");
    expect(bad).toContain("VAPID_PRIVATE_KEY must be");
    expect(bad).not.toContain(pair.privateKey);
    expect(problems({ ...WARD, ...VAPID, VAPID_SUBJECT: "johndoe@example.com" })).toContain("VAPID_SUBJECT must be");
    expect(problems({ ...WARD, ...VAPID, VAPID_SUBJECT: "http://example.com" })).toContain("VAPID_SUBJECT must be");
    expect(loadConfig({ ...WARD, ...VAPID, VAPID_SUBJECT: "https://gandolh.ro/satchel/" }).push.enabled).toBe(true);
  });

  it("refuses two keys that aren't one pair", () => {
    const other = vapidPair();
    const message = problems({ ...WARD, ...VAPID, VAPID_PUBLIC_KEY: other.publicKey });
    expect(message).toContain("not one pair");
    expect(message).not.toContain(pair.privateKey);
  });
});

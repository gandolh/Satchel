import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApp, type TestApp } from "@satchel/server/testing";
import { DEFAULT_URL, parseEnvFile, resolveConfig, type Context } from "./config.js";
import { main } from "./main.js";

const PACKAGE_ROOT = new URL("../", import.meta.url);
const OWNER = "subject-a";

let t: TestApp;
let url: string;
let inbox: string;
let token: string;
let tokenId: string;
let home: string;
let scratch: string;

beforeAll(async () => {
  t = await startTestApp();
  await t.app.listen({ host: "127.0.0.1", port: 0 });
  const address = t.app.server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  url = `http://127.0.0.1:${address.port}`;
  t.store.upsertAccount(OWNER, "ana");
  inbox = t.store.ensureInbox(OWNER);
  const created = t.store.createClaudeToken(OWNER);
  token = created.token;
  tokenId = created.id;
});
afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "satchel-cli-"));
  home = join(scratch, "home");
  mkdirSync(home);
  return () => rmSync(scratch, { recursive: true, force: true });
});

function say(text: string): number {
  return t.store.appendMessage({ conversationId: inbox, sender: OWNER, clientId: randomUUID(), text }).message.seq;
}

async function run(argv: string[], env: NodeJS.ProcessEnv = { SATCHEL_URL: url, SATCHEL_TOKEN: token }) {
  const out: string[] = [];
  const err: string[] = [];
  const ctx: Context = { env, home, out: (l) => out.push(l), err: (l) => err.push(l) };
  const code = await main(argv, ctx, PACKAGE_ROOT);
  const res = { code, out: out.join("\n"), err: err.join("\n") };
  // No output of any test may carry a token.
  expect(res.out + res.err).not.toContain(token);
  return res;
}

describe("unread and seen", () => {
  it("prints unread oldest first with continuation lines and the seen footer, then seen clears it", async () => {
    const first = say("Warmup timer that counts down per exercise");
    const last = say("instead of one long timer\nsecond line");
    const res = await run(["unread"]);
    expect(res.code).toBe(0);
    const lines = res.out.split("\n");
    expect(lines[0]).toMatch(/^Ideas inbox · \d+ unread · seen up to #\d+$/);
    expect(res.out).toMatch(new RegExp(`#${first}  \\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d  Warmup timer`));
    expect(res.out).toMatch(new RegExp(`#${last}  \\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d  instead of one long timer\\n {2,}second line`));
    expect(res.out).toContain("Oldest first. Later messages can correct earlier ones. Gaps in numbers are normal.");
    expect(lines.at(-1)).toBe(`When you have read them all, run:  satchel seen ${last}`);

    const seen = await run(["seen", String(last)]);
    expect(seen).toMatchObject({ code: 0, out: `Seen up to #${last}.` });
    const after = await run(["unread"]);
    expect(after.out).toBe(`Ideas inbox · nothing unread · seen up to #${last}`);
  });

  it("leaves a message appended between unread and seen unread", async () => {
    const a = say("first");
    await run(["unread"]);
    const b = say("arrived meanwhile");
    expect((await run(["seen", String(a)])).out).toBe(`Seen up to #${a}.`);
    const res = await run(["unread"]);
    expect(res.out).toContain(`#${b}  `);
    expect(res.out).not.toContain(`#${a}  `);
  });

  it("reports the server's lower answer when n is past the latest", async () => {
    const latest = say("only");
    const res = await run(["seen", String(latest + 500)]);
    expect(res).toMatchObject({ code: 0, out: `Seen up to #${latest}.` });
  });

  it("rejects a bad seen argument as a usage error", async () => {
    expect((await run(["seen", "abc"])).code).toBe(1);
    expect((await run(["seen", "-1"])).code).toBe(1);
    expect((await run(["seen"])).code).toBe(1);
  });
});

describe("history", () => {
  it("marks seen and unread, and honours --after and --limit", async () => {
    const a = say("hist one");
    const b = say("hist two");
    await run(["seen", String(a)]);
    const all = await run(["history", "--after", String(a - 1), "--limit", "2"]);
    expect(all.code).toBe(0);
    expect(all.out).toMatch(new RegExp(`#${a}  \\S+ \\S+ \\(seen\\)  hist one`));
    expect(all.out).toMatch(new RegExp(`#${b}  \\S+ \\S+ \\(unread\\)  hist two`));
    const later = await run(["history", "--after", String(a)]);
    expect(later.out).not.toContain(`#${a}  `);
    expect(later.out).toContain(`#${b}  `);
    expect((await run(["history", "--since", "not a date"])).code).toBe(2);
    expect((await run(["history", "--limit", "x"])).code).toBe(1);
  });
});

describe("config order", () => {
  it("uses env over the file over the default URL", async () => {
    mkdirSync(join(home, ".config", "satchel"), { recursive: true });
    writeFileSync(
      join(home, ".config", "satchel", "env"),
      `# comment\nSATCHEL_URL="${url}"\nexport SATCHEL_TOKEN='${token}'\n`,
    );
    // File only.
    expect((await run(["unread"], {})).code).toBe(0);
    // Env beats file: a dead URL in the environment wins over the live one in the file.
    const dead = await run(["unread"], { SATCHEL_URL: "http://127.0.0.1:1" });
    expect(dead.code).toBe(3);
    expect(dead.err).toBe("satchel: Satchel isn't reachable at http://127.0.0.1:1. Tell the owner and carry on without it.");
    // An env token beats the file's token.
    const bad = await run(["unread"], { SATCHEL_TOKEN: "stl_wrong" });
    expect(bad.code).toBe(2);
  });

  it("defaults the URL only when nothing sets it", () => {
    const ctx: Context = { env: { SATCHEL_TOKEN: "stl_x" }, home, out: () => {}, err: () => {} };
    expect(resolveConfig(ctx).url).toBe(DEFAULT_URL);
    expect(DEFAULT_URL).toBe("https://gandolh.ro/satchel-api");
  });
});

describe("failures", () => {
  it("a missing token is a usage error", async () => {
    const res = await run(["unread"], { SATCHEL_URL: url });
    expect(res.code).toBe(1);
    expect(res.err).toContain("No Claude token. Create one in Satchel under Settings → Connect Claude");
  });

  it("a revoked token is exit 2 telling the owner to make a new one", async () => {
    const other = t.store.createClaudeToken(OWNER);
    t.store.revokeClaudeToken(OWNER, other.id);
    const res = await run(["unread"], { SATCHEL_URL: url, SATCHEL_TOKEN: other.token });
    expect(res.code).toBe(2);
    expect(res.err).toContain("unknown or revoked");
    expect(res.err).toContain("Settings");
    expect(res.err).not.toContain(other.token);
    expect(tokenId).toBeTruthy();
  });

  it("nothing listening is exit 3 with exactly one stderr line", async () => {
    const port = await freePort();
    const dead = `http://127.0.0.1:${port}`;
    const res = await run(["unread"], { SATCHEL_URL: dead, SATCHEL_TOKEN: token });
    expect(res.code).toBe(3);
    expect(res.err).toBe(`satchel: Satchel isn't reachable at ${dead}. Tell the owner and carry on without it.`);
  });

  it("an answer the CLI can't parse is exit 2", async () => {
    const fake = await listenJson({ nope: true });
    const res = await run(["unread"], { SATCHEL_URL: fake.url, SATCHEL_TOKEN: token });
    await fake.close();
    expect(res.code).toBe(2);
    expect(res.err).toContain("Is the CLI out of date?");
  });
});

describe("a server that is down or stuck", () => {
  const oneLine = (u: string) => `satchel: Satchel isn't reachable at ${u}. Tell the owner and carry on without it.`;

  it("a stalled body is exit 3, not a timeout error", async () => {
    const { createServer: http } = await import("node:http");
    const s = http((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write("{");
    });
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    const u = `http://127.0.0.1:${(s.address() as { port: number }).port}`;
    const res = await run(["unread"], { SATCHEL_URL: u, SATCHEL_TOKEN: token });
    s.closeAllConnections();
    await new Promise<void>((r) => s.close(() => r()));
    expect(res.code).toBe(3);
    expect(res.err).toBe(oneLine(u));
  }, 15_000);

  it.each([502, 503, 504, 500])("a %i with an HTML body is exit 3", async (status) => {
    const { createServer: http } = await import("node:http");
    const s = http((_req, res) => {
      res.writeHead(status, { "content-type": "text/html" });
      res.end("<html>Bad Gateway</html>");
    });
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    const u = `http://127.0.0.1:${(s.address() as { port: number }).port}`;
    const res = await run(["unread"], { SATCHEL_URL: u, SATCHEL_TOKEN: token });
    await new Promise<void>((r) => s.close(() => r()));
    expect(res.code).toBe(3);
    expect(res.err).toBe(oneLine(u));
  });
});

describe("config hardening", () => {
  it("strips an inline comment from an unquoted value but keeps # inside quotes", () => {
    expect(parseEnvFile("SATCHEL_TOKEN=stl_abc # work\nA='x # y'\nB=\"p#q\" # c\nC=ab#cd")).toEqual({
      SATCHEL_TOKEN: "stl_abc",
      A: "x # y",
      B: "p#q",
      C: "ab#cd",
    });
  });

  it("refuses a plain-http, non-loopback URL as a usage error", async () => {
    const res = await run(["unread"], { SATCHEL_URL: "http://example.com", SATCHEL_TOKEN: token });
    expect(res.code).toBe(1);
    expect(res.err).toContain("only sent over https");
  });
});

describe("guide and flags", () => {
  it("prints the guide without a token or a server, in under 40 lines", async () => {
    const res = await run(["guide"], {});
    expect(res.code).toBe(0);
    expect(res.out.split("\n").length).toBeLessThan(40);
    for (const n of [1, 2, 3, 4, 5, 6, 7]) expect(res.out).toContain(`${n}. `);
    expect(res.out).toContain("satchel seen N");
  });

  it("answers --version and --help, and rejects unknown commands", async () => {
    expect((await run(["--version"], {})).out).toBe("0.1.0");
    const help = await run(["--help"], { SATCHEL_TOKEN: token });
    expect(help.code).toBe(0);
    expect(help.out).toContain("satchel");
    expect((await run(["frobnicate"], {})).code).toBe(1);
  });
});

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

async function listenJson(body: unknown): Promise<{ url: string; close: () => Promise<void> }> {
  const { createServer: http } = await import("node:http");
  const s = http((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => s.close(() => r())) };
}

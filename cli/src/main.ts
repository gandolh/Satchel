import { readFileSync } from "node:fs";
import { parseArgs, type ParseArgsConfig } from "node:util";
import { SatchelClient } from "./client.js";
import { resolveConfig, type Context } from "./config.js";
import { renderGuide } from "./commands/guide.js";
import { Rejected, Unreachable, UsageError } from "./errors.js";
import { renderHistory, renderUnread } from "./format.js";

/** `satchel`: how Claude reads the owner's Ideas inbox. Exit codes: 0 ok, 1 usage, 2 rejected, 3 unreachable. */

const USAGE = `satchel: read the owner's Ideas inbox.

  guide                                 the rules to follow
  unread                                unread messages, oldest first
  seen <n>                              mark everything up to #n as seen
  history [--after n] [--since date] [--limit n]
  --version, --help

Address and token: SATCHEL_URL / SATCHEL_TOKEN in the environment, else in ~/.config/satchel/env.`;

function parse<O extends NonNullable<ParseArgsConfig["options"]>>(args: string[], options: O) {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (err) {
    throw new UsageError((err as Error).message);
  }
}

function nonNegativeInt(value: string, what: string): number {
  if (!/^\d+$/.test(value)) throw new UsageError(`${what} must be a non-negative whole number, got "${value}"`);
  return Number.parseInt(value, 10);
}

/** Run one invocation and return its exit code. `packageRoot` is the cli package's directory. */
export async function main(argv: string[], ctx: Context, packageRoot: URL): Promise<number> {
  const [name, ...args] = argv;
  if (!name || name === "help" || name === "--help" || name === "-h") {
    ctx.out(USAGE);
    return name ? 0 : 1;
  }
  if (name === "--version" || name === "-v") {
    ctx.out((JSON.parse(readFileSync(new URL("package.json", packageRoot), "utf8")) as { version: string }).version);
    return 0;
  }
  try {
    switch (name) {
      case "guide": {
        parse(args, {});
        ctx.out(renderGuide(packageRoot));
        return 0;
      }
      case "unread": {
        parse(args, {});
        const { seenUpTo, messages } = await client(ctx).unread();
        ctx.out(renderUnread(seenUpTo, messages));
        return 0;
      }
      case "seen": {
        const { positionals } = parse(args, {});
        if (positionals.length !== 1) throw new UsageError("usage: satchel seen <n>");
        const upTo = nonNegativeInt(positionals[0]!, "<n>");
        const res = await client(ctx).seen(upTo);
        ctx.out(`Seen up to #${res.seenUpTo}.`);
        return 0;
      }
      case "history": {
        const { values, positionals } = parse(args, {
          after: { type: "string" },
          since: { type: "string" },
          limit: { type: "string" },
        });
        if (positionals.length > 0) throw new UsageError("usage: satchel history [--after n] [--since date] [--limit n]");
        const query = {
          after: values.after === undefined ? undefined : nonNegativeInt(String(values.after), "--after"),
          since: values.since === undefined ? undefined : String(values.since),
          limit: values.limit === undefined ? undefined : nonNegativeInt(String(values.limit), "--limit"),
        };
        const res = await client(ctx).history(query);
        ctx.out(renderHistory(res.messages));
        return 0;
      }
      default:
        throw new UsageError(`unknown command "${name}". Run satchel --help.`);
    }
  } catch (err) {
    if (err instanceof Unreachable || err instanceof Rejected) {
      ctx.err(err.message);
      return err.exitCode;
    }
    ctx.err(`satchel: ${(err as Error).message}`);
    return err instanceof UsageError ? err.exitCode : 1;
  }
}

function client(ctx: Context): SatchelClient {
  const { url, token } = resolveConfig(ctx);
  return new SatchelClient(url, token);
}

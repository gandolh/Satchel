import {
  routes,
  type ClaudeMessagesResponse,
  type ClaudeUnreadResponse,
} from "@satchel/shared";
import { Rejected, Unreachable } from "./errors.js";

/** What a route schema offers, so the CLI needs no direct zod dependency. */
interface Schema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

const TIMEOUT_MS = 5_000;

const OUT_OF_DATE = "satchel: Satchel answered with something this CLI doesn't understand. Is the CLI out of date?";
const BAD_TOKEN = "satchel: Satchel doesn't know this token: it is unknown or revoked. Create a new one in Satchel under Settings → Connect Claude.";

/** A server rejection (exit 2), or an answer this CLI can't read (also exit 2). */
export class SatchelClient {
  constructor(
    readonly url: string,
    private readonly token: string,
  ) {}

  private async call<T>(method: string, path: string, schema: Schema<T>, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.url}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new Unreachable(this.url);
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (res.status === 401) throw new Rejected(BAD_TOKEN);
    if (!res.ok) {
      const message = (json as { error?: { message?: unknown } } | undefined)?.error?.message;
      if (typeof message === "string") throw new Rejected(`satchel: ${message}`);
      throw new Rejected(res.status >= 500 ? `satchel: Satchel failed (${res.status}).` : OUT_OF_DATE);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new Rejected(OUT_OF_DATE);
    return parsed.data;
  }

  unread(): Promise<ClaudeUnreadResponse> {
    return this.call("GET", routes.claudeUnread.path, routes.claudeUnread.response);
  }

  seen(upTo: number): Promise<{ seenUpTo: number }> {
    return this.call("POST", routes.claudeSeen.path, routes.claudeSeen.response, { upTo });
  }

  history(query: { after?: number; since?: string; limit?: number }): Promise<ClaudeMessagesResponse> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
    const qs = params.toString();
    return this.call("GET", `${routes.claudeMessages.path}${qs ? `?${qs}` : ""}`, routes.claudeMessages.response);
  }
}

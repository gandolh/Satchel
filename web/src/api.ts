import {
  errorResponseSchema,
  routes,
  type ClaudeTokensResponse,
  type ConversationsResponse,
  type CreateClaudeTokenResponse,
  type HttpMethod,
  type MeResponse,
  type MessagesResponse,
  type RevokeClaudeTokenResponse,
  type SeenRequest,
  type SeenResponse,
  type SendMessageRequest,
  type SendMessageResponse,
} from "@satchel/shared";
import { ApiError, NetworkError, NoAccess, SignedOut, Unavailable } from "./errors";
import { goToWardLogin, renewalGeneration, renewSince } from "./ward";

export { ApiError, NetworkError, NoAccess, SignedOut, Unavailable } from "./errors";

/**
 * The typed API client: one function per phase-1 route in `shared`'s
 * `routes`, responses parsed with the shared schemas so the app can't drift
 * from the server.
 *
 * Every call rides Ward's `ward_session` cookie, same origin. A 401 renews the
 * session once (concurrent 401s share one `POST /ward-api/refresh`) and
 * retries once; if renewal fails the browser goes to Ward's login page and
 * the call throws `SignedOut`. A 403 throws `NoAccess`, a 503 `Unavailable`,
 * a request that never got an answer `NetworkError`, and any other error
 * `ApiError` carrying the server's `code` and `message`. An aborted call
 * rethrows the abort reason unchanged.
 */

/** Where Caddy (and the Vite dev proxy) serve the API. */
export const API_BASE = "/satchel-api";

export interface CallOptions {
  /** Aborts the request, e.g. `AbortSignal.timeout(10_000)`. */
  signal?: AbortSignal;
}

/**
 * `GET …/messages` query as the caller writes it (both keys optional): the
 * schema's input type. Read through `_zod` because the web workspace can't
 * import `zod` itself: the root copy is a different version from shared's.
 */
export type MessagesQueryInput = (typeof routes.listMessages.query)["_zod"]["input"];

// --- Auth events --------------------------------------------------------------

/** What the auth gate needs to hear about from any call, not only its own. */
export type AuthEvent = "no-access" | "signed-out";

const authListeners = new Set<(event: AuthEvent) => void>();

/** Subscribe to auth events from every API call. Returns an unsubscribe function. */
export function onAuthEvent(listener: (event: AuthEvent) => void): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

function emit(event: AuthEvent): void {
  for (const listener of authListeners) listener(event);
}

// --- The routes ---------------------------------------------------------------

export function getMe(options?: CallOptions): Promise<MeResponse> {
  return call(routes.me, {}, options);
}

export function listConversations(options?: CallOptions): Promise<ConversationsResponse> {
  return call(routes.listConversations, {}, options);
}

/** Messages with seq above `query.after` (default 0), ascending, at most `query.limit` (default 200). */
export function listMessages(
  conversationId: string,
  query: MessagesQueryInput = {},
  options?: CallOptions,
): Promise<MessagesResponse> {
  return call(routes.listMessages, { id: conversationId, query }, options);
}

/** 201 when stored, 200 when the client ID was already stored with the same text; both resolve. */
export function sendMessage(
  conversationId: string,
  body: SendMessageRequest,
  options?: CallOptions,
): Promise<SendMessageResponse> {
  return call(routes.sendMessage, { id: conversationId, body }, options);
}

/** Move my seen marker forward to `upTo` (never back). */
export function markSeen(
  conversationId: string,
  body: SeenRequest,
  options?: CallOptions,
): Promise<SeenResponse> {
  return call(routes.markSeen, { id: conversationId, body }, options);
}

export function listClaudeTokens(options?: CallOptions): Promise<ClaudeTokensResponse> {
  return call(routes.listClaudeTokens, {}, options);
}

/** The only response that ever carries a Claude token. Show it once, then drop it. */
export function createClaudeToken(options?: CallOptions): Promise<CreateClaudeTokenResponse> {
  return call(routes.createClaudeToken, {}, options);
}

export function revokeClaudeToken(tokenId: string, options?: CallOptions): Promise<RevokeClaudeTokenResponse> {
  return call(routes.revokeClaudeToken, { id: tokenId }, options);
}

// --- Plumbing -----------------------------------------------------------------

/** The part of a zod schema the client uses, so the shared schemas fit without importing zod. */
interface ResponseSchema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false };
}

interface CallRoute<T> {
  method: HttpMethod;
  path: string;
  response: ResponseSchema<T>;
}

interface CallParts {
  /** Fills `:id` in the path. */
  id?: string;
  query?: Record<string, string | number | undefined>;
  /** JSON body. Omitted means no body and no `Content-Type`. */
  body?: unknown;
}

/** The route's URL under `API_BASE`, with `:id` filled in and `undefined` query keys left out. */
export function urlFor(path: string, parts: Pick<CallParts, "id" | "query"> = {}): string {
  const filled = path.replace(":id", () => {
    if (parts.id === undefined || parts.id === "") throw new Error(`${path} needs an id`);
    return encodeURIComponent(parts.id);
  });
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parts.query ?? {})) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return `${API_BASE}${filled}${query ? `?${query}` : ""}`;
}

async function call<T>(route: CallRoute<T>, parts: CallParts, options: CallOptions = {}): Promise<T> {
  const url = urlFor(route.path, parts);
  const headers: Record<string, string> = { accept: "application/json" };
  const init: RequestInit = { method: route.method, credentials: "same-origin", headers, signal: options.signal };
  if (parts.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(parts.body);
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sentAt = renewalGeneration();
    const response = await send(url, init, options.signal);
    if (response.status !== 401) return read(route.response, response);
    // A 401 after a successful renewal means renewal can't fix it, and a login
    // redirect could loop forever, so report it instead.
    if (attempt > 0) throw new ApiError(401, "unauthorized", "Satchel can't verify your sign-in right now.");
    // Throws `Unavailable` when Ward itself isn't answering.
    if (!(await renewSince(sentAt))) break;
  }

  emit("signed-out");
  goToWardLogin();
  throw new SignedOut();
}

async function send(url: string, init: RequestInit, signal: AbortSignal | undefined): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    throw new NetworkError(error);
  }
}

async function read<T>(schema: ResponseSchema<T>, response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => undefined);

  if (response.ok) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(response.status, null, "Satchel sent an answer this app doesn't understand. Reload the page.");
    }
    return parsed.data;
  }

  const failure = errorResponseSchema.safeParse(body);
  if (!failure.success) {
    // Not Satchel's error shape: a proxy's page in front of a stopped API.
    throw new ApiError(response.status, null, "Satchel isn't answering right now.");
  }
  const { code, message } = failure.data.error;
  if (code === "forbidden") {
    emit("no-access");
    throw new NoAccess(message);
  }
  if (code === "unavailable") throw new Unavailable(response.status, message);
  throw new ApiError(response.status, code, message);
}

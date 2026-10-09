import { ERROR_STATUS, apiError, type ErrorCode } from "@satchel/shared";
import type { FastifyError, FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { ClientIdConflict } from "./store.js";
import { WardAuthenticationError, WardForbiddenError, WardUnavailableError } from "./ward/errors.js";

/**
 * Every error a route sends is the shared shape `{ error: { code, message } }`.
 * A route either throws `ApiError` or calls `sendError`; anything else that is
 * thrown goes through `registerErrorHandling` below.
 */

/** Throw from a route or hook to answer `ERROR_STATUS[code]` with this message. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Answer with a shared error. Returns the reply, so a hook can `return sendError(...)`. */
export function sendError(reply: FastifyReply, code: ErrorCode, message: string): FastifyReply {
  return reply.code(ERROR_STATUS[code]).send(apiError(code, message));
}

const INTERNAL_MESSAGE = "Something went wrong on the server.";

/** The shared code for a 4xx Fastify raised itself (bad JSON, body too large, wrong content type). */
function codeForClientStatus(status: number): ErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  return "invalid_request";
}

function statusOf(error: unknown): number | undefined {
  const status = (error as Partial<FastifyError> | null)?.statusCode;
  return typeof status === "number" ? status : undefined;
}

/**
 * The error handler and the 404 handler, at the root so every route inherits them.
 *
 * - `ApiError` → its code.
 * - A zod error (a route parsing with a shared schema) → 400 `invalid_request`
 *   with the first issue's message. `z.core.$ZodError`'s `instanceof` checks
 *   traits, so it also matches errors from `@satchel/shared`'s own zod copy.
 * - `ClientIdConflict` → 409 `client_id_conflict`.
 * - A Ward error a route let through → 401 / 403 / 503.
 * - A 4xx Fastify raised (bad JSON, a body over the limit, an unsupported
 *   content type) → the matching code, keeping Fastify's status (413, 415).
 * - Anything else, `NotAMember` included → 500 `internal`. Logged; the
 *   message never carries the details.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof ApiError) return sendError(reply, error.code, error.message);

    if (error instanceof z.core.$ZodError) {
      return sendError(reply, "invalid_request", error.issues[0]?.message ?? "The request is not valid.");
    }

    if (error instanceof ClientIdConflict) return sendError(reply, "client_id_conflict", error.message);

    if (error instanceof WardUnavailableError) {
      request.log.error({ err: error }, "ward is not answering; failing closed");
      return sendError(reply, "unavailable", "Ward, the sign-in service, is not answering. Try again in a minute.");
    }
    if (error instanceof WardAuthenticationError) return sendError(reply, "unauthorized", "Sign in with Ward to use Satchel.");
    if (error instanceof WardForbiddenError) return sendError(reply, "forbidden", "This Ward account has no access to Satchel.");

    const status = statusOf(error);
    if (status !== undefined && status >= 400 && status < 500) {
      const message = error instanceof Error ? error.message : "The request is not valid.";
      return reply.code(status).send(apiError(codeForClientStatus(status), message));
    }

    request.log.error({ err: error }, "unhandled error");
    return sendError(reply, "internal", INTERNAL_MESSAGE);
  });

  app.setNotFoundHandler((_request, reply) => sendError(reply, "not_found", "There is no such route."));
}

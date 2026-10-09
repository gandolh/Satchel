import type { ErrorCode } from "@satchel/shared";

/**
 * Errors the API client raises. Callers branch on the class first and on
 * `code` second, never on `status`: Fastify answers 413 and 415 with
 * `invalid_request` too, and a proxy in front of a stopped API answers with a
 * status and no Satchel body at all.
 */

/** The API answered with an error. `code` is null when the body wasn't Satchel's error shape. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | null;

  constructor(status: number, code: ErrorCode | null, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** 403 `forbidden`: a live Ward session without a Satchel grant. Signing in again changes nothing. */
export class NoAccess extends ApiError {
  constructor(message = "This account has no access to Satchel.") {
    super(403, "forbidden", message);
    this.name = "NoAccess";
  }
}

/** 503 `unavailable` from the API, or Ward itself not answering a renewal. Retrying is the fix. */
export class Unavailable extends ApiError {
  constructor(status = 503, message = "Satchel can't reach sign-in right now.") {
    super(status, "unavailable", message);
    this.name = "Unavailable";
  }
}

/**
 * The session is over and renewing it failed. The browser is already on its
 * way to Ward's login page; there is nothing to show but that.
 */
export class SignedOut extends Error {
  constructor() {
    super("Signed out. Taking you to sign in.");
    this.name = "SignedOut";
  }
}

/** The request never got an answer: offline, DNS, a dropped connection. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("Satchel can't be reached. Check your connection.", { cause });
    this.name = "NetworkError";
  }
}

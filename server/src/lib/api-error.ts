import type { ErrorCode } from "@satchel/shared";

/**
 * The server's one error class. Throw it from a route or a hook to answer
 * `ERROR_STATUS[code]` (`@satchel/shared`) with this message; the error plugin
 * (`plugins/errors.ts`) writes the shared body `{ error: { code, message } }`.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ApiError";
  }
}

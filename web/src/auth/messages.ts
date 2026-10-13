import type { AuthError } from "../../vendor/ward/ward-auth-react.js";

/**
 * The words for the codes the auth hooks hand back. The library names the
 * failure and the app says it (Ward's adoption guide, "Error codes"). An
 * unknown code reads like `unknown`.
 */

/** A failed local sign-in. */
export function loginMessage(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "That username and password don’t match.";
    case "too_many_attempts":
      return error.retryAfterSeconds === undefined
        ? "Too many tries. Wait a little, then try again."
        : `Too many tries. Wait ${waitText(error.retryAfterSeconds)}, then try again.`;
    case "cross_site":
      return "Open Satchel from its own address to sign in.";
    case "network":
      return "Satchel can’t be reached. Check your connection.";
    default:
      return "Couldn’t sign in. Try again.";
  }
}

/** A failed "Sign in with Ward": from the button, or from the redirect back. */
export function wardSignInMessage(error: AuthError): string {
  switch (error.code) {
    case "access_denied":
      return "Ward didn’t let you in here. Ask the owner for access.";
    case "ward_unavailable":
      return "Ward isn’t answering. Sign in with your password instead.";
    case "ward_misconfigured":
      return "Sign in with Ward isn’t set up right on this server. Tell the owner.";
    case "invalid_callback":
      return "That sign-in expired. Try again.";
    case "network":
      return "Satchel can’t be reached. Check your connection.";
    default:
      return "Couldn’t sign in with Ward. Try again.";
  }
}

/** Why a session ended, shown on the login page. Nothing for a plain sign-out. */
export function sessionReasonMessage(reason: string | undefined): string | null {
  switch (reason) {
    case "ward_unavailable":
      return "Ward is unreachable right now. Sign in with your password.";
    case "ward_session_ended":
      return "Your Ward session ended. Sign in again.";
    case "ward_misconfigured":
      return "Sign in with Ward isn’t set up right on this server. Sign in with your password.";
    default:
      return null;
  }
}

/** What a settings action says went wrong. */
export function settingsMessage(error: AuthError): string {
  switch (error.code) {
    case "already_linked":
      return "A Ward account is already linked.";
    case "ward_account_in_use":
      return "That Ward account is linked to someone else here.";
    case "ward_account_mismatch":
      return "That was a different Ward account. Use the one you linked.";
    case "access_denied":
      return "Ward didn’t let you in here. Ask the owner for access.";
    case "invalid_callback":
      return "That round trip expired. Try again.";
    case "ward_unavailable":
      return "Ward isn’t answering right now. Try again later.";
    case "ward_misconfigured":
      return "Ward isn’t set up right on this server. Tell the owner.";
    case "no_local_password":
      return "Set a password first, so you can still sign in without Ward.";
    case "not_linked":
      return "No Ward account is linked.";
    case "reauthentication_required":
      return "Sign in to Ward again to confirm it’s you, then set the password.";
    case "invalid_credentials":
      return "That isn’t your current password.";
    case "password_too_short":
      return "Use at least 8 characters.";
    case "password_too_long":
      return "That password is too long.";
    case "too_many_attempts":
      return error.retryAfterSeconds === undefined
        ? "Too many tries. Wait a little, then try again."
        : `Too many tries. Wait ${waitText(error.retryAfterSeconds)}, then try again.`;
    case "unauthorized":
      return "Your session ended. Sign in again.";
    case "network":
      return "Satchel can’t be reached. Check your connection.";
    default:
      return "Something went wrong. Try again.";
  }
}

function waitText(seconds: number): string {
  if (seconds < 90) return `${Math.max(1, Math.ceil(seconds))} seconds`;
  return `${Math.ceil(seconds / 60)} minutes`;
}

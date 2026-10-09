import type { MeResponse } from "@satchel/shared";
import { createContext, useContext } from "react";
import { getMe, NoAccess, SignedOut, Unavailable } from "../api";

/**
 * What the auth gate is showing. Only `signed-out` redirects (and the API
 * client has already started that navigation); the rest stop and say why.
 *
 * - `no-access`: a live Ward session without a Satchel grant. Sending it to
 *   the login page would be a loop: only the owner granting access fixes it.
 * - `unavailable`: the API is up but Ward isn't. The login page is Ward's, so
 *   a redirect would fail the same way.
 * - `unreachable`: no answer from Satchel at all (offline, API down).
 */
export type GateState =
  | { kind: "checking" }
  | { kind: "signed-in"; me: MeResponse }
  | { kind: "signed-out" }
  | { kind: "no-access" }
  | { kind: "unavailable" }
  | { kind: "unreachable" };

/** The gate state for an error thrown by the `GET /api/me` probe. */
export function gateStateForError(error: unknown): GateState {
  if (error instanceof SignedOut) return { kind: "signed-out" };
  if (error instanceof NoAccess) return { kind: "no-access" };
  if (error instanceof Unavailable) return { kind: "unavailable" };
  return { kind: "unreachable" };
}

/** Ask the API who is signed in. Never throws. */
export async function checkSession(): Promise<GateState> {
  try {
    return { kind: "signed-in", me: await getMe() };
  } catch (error) {
    return gateStateForError(error);
  }
}

/** The signed-in account, provided by the gate to everything inside it. */
export const MeContext = createContext<MeResponse | null>(null);

/** The signed-in account: `subject`, `displayName`, `inboxId`. Only valid inside the auth gate. */
export function useMe(): MeResponse {
  const me = useContext(MeContext);
  if (me === null) throw new Error("useMe() was called outside the auth gate");
  return me;
}

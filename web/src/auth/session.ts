import type { MeResponse } from "@satchel/shared";
import { createContext, useContext } from "react";
import { getMe, SignedOut } from "../api";

/**
 * What the auth gate is showing once somebody is signed in. The login page
 * itself is the gate's other half and is driven by the session state of the
 * vendored hooks (`useSession`), not by this.
 *
 * - `checking`: asking `GET /api/me` for the account and its Ideas inbox.
 * - `signed-in`: the account; the app renders.
 * - `unreachable`: no answer from Satchel at all (offline, API down).
 */
export type GateState =
  | { kind: "checking" }
  | { kind: "signed-in"; me: MeResponse }
  | { kind: "unreachable" };

/**
 * Ask the API who is signed in. Never throws. A 401 (the session ended
 * between the two requests) leaves the gate checking: the API client has
 * already told the login page to take over.
 */
export async function checkSession(): Promise<GateState> {
  try {
    return { kind: "signed-in", me: await getMe() };
  } catch (error) {
    return error instanceof SignedOut ? { kind: "checking" } : { kind: "unreachable" };
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

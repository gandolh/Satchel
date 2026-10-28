import { useLayoutEffect } from "react";
import { useMe } from "../auth/session";
import { CHATS, navigate, threadRoute } from "../router";
import { offerDraft, takeSharedText } from "./share";

/**
 * The share route, signed in: hand the shared text to the Ideas inbox's
 * composer and replace the address with the inbox's, before anything paints.
 * A friend has no inbox, so they land on the chat list and the text goes to
 * the first chat they open. Nothing shared (a share already used): the inbox,
 * or the list, with an empty composer.
 */
export function ShareScreen() {
  const { inboxId } = useMe();
  useLayoutEffect(() => {
    // StrictMode runs this twice; the second take finds nothing and keeps the first draft.
    const text = takeSharedText();
    if (text !== null) offerDraft(inboxId, text);
    navigate(inboxId === null ? CHATS : threadRoute(inboxId), { replace: true });
  }, [inboxId]);
  return null;
}

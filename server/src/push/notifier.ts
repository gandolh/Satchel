import type { Message } from "@satchel/shared";
import type { StoredPushSubscription, Store } from "../store.js";
import { pushPayloadFor, pushRecipients } from "./payload.js";
import type { SendPush } from "./sender.js";

export interface PushLog {
  info(details: object, message: string): void;
  warn(details: object, message: string): void;
}

/**
 * Web Push for stored messages (brief 14). Routes call `messageStored` after
 * the store call succeeded, the same place they publish live events.
 */
export interface PushNotifier {
  /** The VAPID public key browsers subscribe with. Null when push is off. */
  readonly publicKey: string | null;
  /**
   * A message was stored, not a repeated client ID. Pushes it to every
   * device of every member except the sender, Claude and any account that
   * lost its Satchel grant, starting on the next turn of the event loop,
   * after the route has handed Fastify its reply. Never throws and never
   * waits: a push that fails is logged, and a 404 or 410 from the push
   * service deletes that subscription. Nothing is retried.
   */
  messageStored(message: Message): void;
  /** Resolves once every push started so far has finished. For shutdown and tests. */
  whenIdle(): Promise<void>;
}

/** Push turned off: no key to hand out, nothing sent. */
export const pushOff: PushNotifier = {
  publicKey: null,
  messageStored() {},
  whenIdle: () => Promise.resolve(),
};

export interface PushNotifierDeps {
  store: Store;
  publicKey: string;
  send: SendPush;
  log: PushLog;
}

/** A push service's answer that means the subscription is gone for good. */
const GONE: ReadonlySet<number> = new Set([404, 410]);

function statusOf(error: unknown): number | undefined {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : undefined;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Only the push service's host is logged: the full endpoint addresses one device. */
function pushServiceOf(endpoint: string): string {
  return URL.canParse(endpoint) ? new URL(endpoint).host : "unknown";
}

export function createPushNotifier({ store, publicKey, send, log }: PushNotifierDeps): PushNotifier {
  const pending = new Set<Promise<void>>();

  async function deliver(subject: string, sub: StoredPushSubscription, payload: string): Promise<void> {
    const details = { subject, pushService: pushServiceOf(sub.endpoint) };
    try {
      await send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
    } catch (error) {
      const statusCode = statusOf(error);
      if (statusCode !== undefined && GONE.has(statusCode)) {
        store.forgetPushEndpoint(sub.endpoint);
        log.info({ ...details, statusCode }, "push subscription expired; deleted");
        return;
      }
      log.warn({ ...details, statusCode, reason: reasonOf(error) }, "push not delivered");
      return;
    }
    store.markPushDelivered(sub.endpoint);
  }

  async function notify(message: Message): Promise<void> {
    const conversation = store.getConversation(message.conversationId, message.sender);
    if (conversation === null) return;
    // An account that lost its grant gets nothing, whatever subscriptions it
    // still has. The guard deletes them when it marks the account; this is
    // the second lock.
    const recipients = pushRecipients(conversation, message.sender).filter((subject) =>
      store.isAccountActive(subject),
    );
    if (recipients.length === 0) return;
    const payload = JSON.stringify(pushPayloadFor(conversation, message));
    await Promise.all(
      recipients.flatMap((subject) => store.listPushSubscriptions(subject).map((sub) => deliver(subject, sub, payload))),
    );
  }

  return {
    publicKey,

    messageStored(message) {
      const task = new Promise<void>((resolve) => setImmediate(resolve))
        .then(() => notify(message))
        .catch((error: unknown) => {
          log.warn({ conversationId: message.conversationId, reason: reasonOf(error) }, "push notifications not sent");
        });
      pending.add(task);
      void task.finally(() => pending.delete(task));
    },

    async whenIdle() {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
  };
}

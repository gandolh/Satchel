import { CLAUDE_MEMBER, type ConversationSummary, type Message } from "@satchel/shared";
import { describe, expect, it, vi } from "vitest";
import { pushPayloadFor, pushRecipients } from "./payload.js";
import { PUSH_TTL_SECONDS, webPushSender } from "./sender.js";

const at = "2026-10-09T08:00:00.000Z";

function conversation(kind: ConversationSummary["kind"], title: string | null, members: string[]): ConversationSummary {
  const names: Record<string, string> = { a: "ana", b: "bob", c: "cora", [CLAUDE_MEMBER]: "Claude" };
  return {
    id: "c1",
    kind,
    title,
    members: members.map((id) => ({ id, displayName: names[id] ?? id, seenUpTo: 0, seenAt: null })),
    lastMessage: null,
    unreadCount: 0,
  };
}

function message(text: string, sender = "a"): Message {
  return { seq: 1, conversationId: "c1", sender, clientId: "6f1c9d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f", text, sentAt: at };
}

describe("pushRecipients", () => {
  it("is every member but the sender and Claude", () => {
    expect(pushRecipients(conversation("group", "Hike", ["a", "b", "c"]), "a")).toEqual(["b", "c"]);
    expect(pushRecipients(conversation("direct", null, ["a", "b"]), "b")).toEqual(["a"]);
  });

  it("is nobody for the Ideas inbox, whoever sent", () => {
    const inbox = conversation("inbox", null, ["a", CLAUDE_MEMBER]);
    expect(pushRecipients(inbox, "a")).toEqual([]);
    expect(pushRecipients(inbox, CLAUDE_MEMBER)).toEqual([]);
  });
});

describe("pushPayloadFor", () => {
  it("titles a direct chat with the sender's name", () => {
    expect(pushPayloadFor(conversation("direct", null, ["a", "b"]), message("hi"))).toEqual({
      conversationId: "c1",
      title: "ana",
      body: "hi",
    });
  });

  it('titles a group "Sender in Group"', () => {
    expect(pushPayloadFor(conversation("group", "Hike on Saturday", ["a", "b", "c"]), message("hi")).title).toBe(
      "ana in Hike on Saturday",
    );
  });

  it("keeps the first 120 characters, never splitting an emoji", () => {
    const direct = conversation("direct", null, ["a", "b"]);
    expect(pushPayloadFor(direct, message("x".repeat(121))).body).toBe("x".repeat(120));
    expect(pushPayloadFor(direct, message("x".repeat(120))).body).toBe("x".repeat(120));
    const emoji = pushPayloadFor(direct, message("😀".repeat(130))).body;
    expect(Array.from(emoji)).toHaveLength(120);
    expect(emoji).toBe("😀".repeat(120));
  });
});

describe("webPushSender", () => {
  it("sends with the VAPID keys, TTL 24 hours and urgency normal, on every call", async () => {
    const sendNotification = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} }));
    const vapid = { publicKey: "pub", privateKey: "priv", subject: "mailto:johndoe@example.com" };
    const send = webPushSender(vapid, sendNotification);
    const target = { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: "p", auth: "a" } };

    await send(target, '{"conversationId":"c1"}');

    expect(PUSH_TTL_SECONDS).toBe(86_400);
    expect(sendNotification).toHaveBeenCalledWith(target, '{"conversationId":"c1"}', {
      vapidDetails: vapid,
      TTL: 86_400,
      urgency: "normal",
      timeout: 10_000,
    });
  });

  it("passes a push service's rejection through, status included", async () => {
    const gone = Object.assign(new Error("Received unexpected response code"), { statusCode: 410 });
    const send = webPushSender(
      { publicKey: "pub", privateKey: "priv", subject: "mailto:johndoe@example.com" },
      vi.fn(async () => Promise.reject(gone)),
    );
    await expect(send({ endpoint: "https://x.example/1", keys: { p256dh: "p", auth: "a" } }, "{}")).rejects.toMatchObject({
      statusCode: 410,
    });
  });
});

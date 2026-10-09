import { afterEach, describe, expect, it, vi } from "vitest";
import {
  forgetPushSubscription,
  rebindPushSubscription,
  shouldRebind,
  withDeadline,
  type PushAccountDeps,
  type SubscriptionLike,
} from "./account";

function subscription(): SubscriptionLike & { unsubscribe: ReturnType<typeof vi.fn> } {
  return {
    endpoint: "https://push.example/abc",
    toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "P", auth: "A" } }),
    unsubscribe: vi.fn(async () => true),
  };
}

function deps(over: Partial<PushAccountDeps> = {}): PushAccountDeps {
  return {
    current: async () => null,
    permission: () => "granted",
    save: vi.fn(async () => ({ ok: true as const })) as PushAccountDeps["save"],
    forget: vi.fn(async () => undefined),
    ...over,
  };
}

afterEach(() => vi.useRealTimers());

describe("shouldRebind", () => {
  it("needs granted permission and a subscription", () => {
    expect(shouldRebind("granted", {})).toBe(true);
    expect(shouldRebind("granted", null)).toBe(false);
    expect(shouldRebind("default", {})).toBe(false);
    expect(shouldRebind("denied", {})).toBe(false);
  });
});

describe("withDeadline", () => {
  it("gives up after the deadline and swallows failures", async () => {
    vi.useFakeTimers();
    const slow = withDeadline(new Promise<string>(() => undefined), 2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await slow).toBeUndefined();
    expect(await withDeadline(Promise.reject(new Error("x")), 2000)).toBeUndefined();
    expect(await withDeadline(Promise.resolve("ok"), 2000)).toBe("ok");
  });
});

describe("forgetPushSubscription", () => {
  it("deletes the endpoint on the server and unsubscribes", async () => {
    const sub = subscription();
    const d = deps({ current: async () => sub });
    await forgetPushSubscription(d);
    expect(d.forget).toHaveBeenCalledWith("https://push.example/abc");
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it("still unsubscribes when the server call fails, and never throws", async () => {
    const sub = subscription();
    await forgetPushSubscription(deps({ current: async () => sub, forget: async () => Promise.reject(new Error("down")) }));
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it("does nothing without a subscription", async () => {
    const d = deps();
    await forgetPushSubscription(d);
    expect(d.forget).not.toHaveBeenCalled();
  });

  it("returns within the deadline when the server hangs", async () => {
    vi.useFakeTimers();
    const d = deps({ current: async () => subscription(), forget: () => new Promise(() => undefined) });
    // unsubscribe settles, forget never does
    const done = forgetPushSubscription(d, 2000);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(done).resolves.toBeUndefined();
  });
});

describe("rebindPushSubscription", () => {
  it("saves the existing subscription when granted", async () => {
    const d = deps({ current: async () => subscription() });
    await rebindPushSubscription(d);
    expect(d.save).toHaveBeenCalledWith({
      endpoint: "https://push.example/abc",
      expirationTime: null,
      keys: { p256dh: "P", auth: "A" },
    });
  });

  it("does nothing when not granted or nothing is subscribed", async () => {
    const a = deps({ permission: () => "default", current: async () => subscription() });
    await rebindPushSubscription(a);
    expect(a.save).not.toHaveBeenCalled();
    const b = deps();
    await rebindPushSubscription(b);
    expect(b.save).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    await expect(
      rebindPushSubscription(deps({ current: async () => Promise.reject(new Error("boom")) })),
    ).resolves.toBeUndefined();
  });
});

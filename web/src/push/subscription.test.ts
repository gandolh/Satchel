import { describe, expect, it } from "vitest";
import { base64UrlToBytes, isIos, pushSupport, sameKey, subscriptionBody, type PushEnvironment } from "./subscription";

const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";

const capable: PushEnvironment = {
  userAgent: CHROME_ANDROID,
  platform: "Linux armv8l",
  maxTouchPoints: 5,
  standalone: false,
  serviceWorker: true,
  pushManager: true,
  notification: true,
};

describe("pushSupport", () => {
  it("is ok on Android Chrome in a tab: no Home Screen step there", () => {
    expect(pushSupport(capable)).toBe("ok");
  });

  it("sends an iPhone in a Safari tab to the Home Screen first, whatever it reports", () => {
    const tab = { ...capable, userAgent: IPHONE, platform: "iPhone", pushManager: false };
    expect(pushSupport(tab)).toBe("ios-home-screen");
    expect(pushSupport({ ...tab, pushManager: true })).toBe("ios-home-screen");
  });

  it("is ok in the iPhone's Home Screen app, and asks for an update when it has no Push", () => {
    const app = { ...capable, userAgent: IPHONE, platform: "iPhone", standalone: true };
    expect(pushSupport(app)).toBe("ok");
    expect(pushSupport({ ...app, pushManager: false })).toBe("ios-update");
  });

  it("treats an iPad that says it is a Mac as iOS, and a real Mac as a computer", () => {
    expect(isIos({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
    expect(pushSupport({ ...capable, userAgent: MAC, platform: "MacIntel", maxTouchPoints: 0 })).toBe("ok");
  });

  it("is unsupported without service workers, Push or notifications", () => {
    expect(pushSupport({ ...capable, serviceWorker: false })).toBe("unsupported");
    expect(pushSupport({ ...capable, pushManager: false })).toBe("unsupported");
    expect(pushSupport({ ...capable, notification: false })).toBe("unsupported");
  });
});

describe("base64UrlToBytes and sameKey", () => {
  it("decodes base64url, padded or not", () => {
    expect([...base64UrlToBytes("-_8")]).toEqual([0xfb, 0xff]);
    expect([...base64UrlToBytes("AQID")]).toEqual([1, 2, 3]);
    expect([...base64UrlToBytes("AQ==")]).toEqual([1]);
    const key = `B${"A".repeat(86)}`;
    const bytes = base64UrlToBytes(key);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });

  it("compares a subscription's key with the server's", () => {
    const key = base64UrlToBytes("AQID");
    expect(sameKey(new Uint8Array([1, 2, 3]).buffer, key)).toBe(true);
    expect(sameKey(new Uint8Array([1, 2, 4]).buffer, key)).toBe(false);
    expect(sameKey(new Uint8Array([1, 2]).buffer, key)).toBe(false);
    expect(sameKey(null, key)).toBe(false);
  });
});

describe("subscriptionBody", () => {
  const keys = { p256dh: `B${"A".repeat(86)}`, auth: "A".repeat(22) };

  it("turns PushSubscription.toJSON() into the request body", () => {
    expect(subscriptionBody({ endpoint: "https://fcm.googleapis.com/fcm/send/x", keys })).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/x",
      expirationTime: null,
      keys,
    });
    expect(subscriptionBody({ endpoint: "https://x.example/1", expirationTime: 5, keys })?.expirationTime).toBe(5);
  });

  it("is null when the browser left out the endpoint or a key", () => {
    expect(subscriptionBody({ keys })).toBeNull();
    expect(subscriptionBody({ endpoint: "https://x.example/1", keys: { p256dh: keys.p256dh } })).toBeNull();
    expect(subscriptionBody({ endpoint: "https://x.example/1" })).toBeNull();
  });
});

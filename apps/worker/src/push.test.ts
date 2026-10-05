import { afterEach, expect, it, vi } from "vitest";
import { sendBriefingNotifications, validPushEndpoint } from "./push";
import type { Env } from "./types";

afterEach(() => vi.unstubAllGlobals());
it("rejects arbitrary and disguised push endpoints", () => {
  expect(validPushEndpoint("https://fcm.googleapis.com/fcm/send/token")).toBe(true);
  for (const url of ["http://fcm.googleapis.com/x", "https://127.0.0.1/x", "https://fcm.googleapis.com.evil.test/x", "https://user@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x"]) expect(validPushEndpoint(url)).toBe(false);
});
it("does no database or delivery work until configured", async () => {
  await expect(sendBriefingNotifications({} as Env)).resolves.toBeUndefined();
});
for (const status of [201, 410, 503]) it(`handles push delivery status ${status} without exposing endpoints`, async () => {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const browser = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", keys.publicKey)).toString("base64url");
  const privateKey = (await crypto.subtle.exportKey("jwk", keys.privateKey)).d!;
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/test", expirationTime: null, keys: {
    p256dh: Buffer.from(await crypto.subtle.exportKey("raw", browser.publicKey)).toString("base64url"),
    auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url")
  } };
  const executed: string[] = [];
  const prepare = (sql: string) => ({ bind: (..._values: unknown[]) => ({
    all: async () => ({ results: [{ endpoint: subscription.endpoint, subscription_json: JSON.stringify(subscription), language: "en", newest: "2026-09-27T00:00:00.000Z" }] }),
    run: async () => { executed.push(sql); return { meta: { changes: 1 } }; }
  }) });
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
  vi.stubGlobal("fetch", fetcher);
  await sendBriefingNotifications({ DB: { prepare }, VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: "https://distilled.news" } as unknown as Env);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "post", redirect: "error" });
  expect(executed.some(sql => sql.startsWith("DELETE"))).toBe(status === 410);
  expect(executed.some(sql => sql.includes("SET last_notified_at"))).toBe(status === 201);
});

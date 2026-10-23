import { afterEach, expect, it, vi } from "vitest";
import { sendBriefingNotifications, validPushEndpoint } from "./push";
import { Miniflare } from "miniflare";
import type { Env } from "./types";

afterEach(() => vi.unstubAllGlobals());
it("rejects arbitrary and disguised push endpoints", () => {
  expect(validPushEndpoint("https://fcm.googleapis.com/fcm/send/token")).toBe(true);
  for (const url of ["http://fcm.googleapis.com/x", "https://127.0.0.1/x", "https://fcm.googleapis.com.evil.test/x", "https://user@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x"]) expect(validPushEndpoint(url)).toBe(false);
});
it("does no database or delivery work until configured", async () => {
  await expect(sendBriefingNotifications({} as Env)).resolves.toBeUndefined();
});
for (const status of [201, 302, 410, 503]) it(`handles push delivery status ${status} without exposing endpoints`, async () => {
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
    all: async () => ({ results: sql.includes("MAX(json_extract") ? [{ endpoint: subscription.endpoint, account_id: "owner", subscription_json: JSON.stringify(subscription), notification_version: "v1", last_notified_at: "2026-09-01T00:00:00.000Z", language: "en", newest: "2026-09-27T00:00:00.000Z" }] : [] }),
    run: async () => { executed.push(sql); return { meta: { changes: 1 } }; }
  }) });
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
  vi.stubGlobal("fetch", fetcher);
  await sendBriefingNotifications({ DB: { prepare, batch: async () => { executed.push("release accepted lease"); return []; } }, VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: "https://distilled.news" } as unknown as Env);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "post", redirect: "manual" });
  if (status === 201) {
    // Node accepts redirect:error, but the deployed Workers runtime rejects it
    // before any network request. Validate the actual sender option in workerd.
    const mf = new Miniflare({modules:true,script:`export default {fetch(request) { try { new Request("https://fcm.googleapis.com/fcm/send/synthetic", {method:"POST",body:new Uint8Array(4),redirect:request.headers.get("x-mode")}); return new Response("supported"); } catch {return new Response("unsupported",{status:400});} }}`});
    try {
      const mode = fetcher.mock.calls[0][1].redirect;
      expect((await mf.dispatchFetch("https://local.test", {headers:{"x-mode":mode}})).status).toBe(200);
      expect((await mf.dispatchFetch("https://local.test", {headers:{"x-mode":"error"}})).status).toBe(400);
    } finally {await mf.dispose();}
  }
  expect(executed.some(sql => sql.startsWith("DELETE"))).toBe(status === 410);
  expect(executed.includes("release accepted lease")).toBe(status === 201);
});
for (const failure of ['subscription','payload','send'] as const) it(`reports ${failure} failures without leaking secrets or recording acceptance`, async () => {
  const keys = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const browser = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/private-token',expirationTime:null,keys:{p256dh:Buffer.from(await crypto.subtle.exportKey('raw',browser.publicKey)).toString('base64url'),auth:Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')}};
  const batch=vi.fn();
  const prepare=(sql:string)=>({bind:()=>({all:async()=>({results:sql.includes('MAX(json_extract')?[{endpoint:subscription.endpoint,account_id:'owner',subscription_json:failure==='subscription'?'bad JSON':JSON.stringify(subscription),notification_version:'v1',last_notified_at:'2026-09-01T00:00:00Z',language:'en',newest:'2026-10-23T00:00:00Z'}]:[]}),run:async()=>({meta:{changes:1}})})});
  const send=vi.fn().mockRejectedValue(new TypeError('network failure https://fcm.googleapis.com/private-token secret-key'));
  vi.stubGlobal('fetch',send);
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try {
    await sendBriefingNotifications({DB:{prepare,batch},VAPID_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('base64url'),VAPID_PRIVATE_KEY:failure==='payload'?'invalid-private-key':(await crypto.subtle.exportKey('jwk',keys.privateKey)).d!,VAPID_SUBJECT:'https://distilled.news'} as unknown as Env);
    expect(warn).toHaveBeenCalledWith('Push delivery failed; will retry after lease expires',{phase:failure,errorType:expect.any(String)});
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private-token|secret-key|invalid-private-key/);
    expect(batch).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(failure==='send'?1:0);
  } finally {warn.mockRestore();}
});

import { buildPushPayload } from "@block65/webcrypto-web-push";
import { recordPushAcceptance, settlePushOutbox, ELIGIBLE_PUSH_SQL } from "./push-outbox";
import { z } from "zod";
import type { Env } from "./types";

// Subscription endpoints are browser push services, never arbitrary user URLs.
export function validPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" ||
       url.hostname === "web.push.apple.com" || url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}
export const subscriptionSchema = z.object({
  endpoint: z.string().max(2048).refine(validPushEndpoint),
  expirationTime: z.number().nullable().default(null),
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/) })
});
export const pushConfigured = (env: Env) => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);

export async function sendBriefingNotifications(env: Env) {
  if (!pushConfigured(env)) return;
  const now = new Date().toISOString();
  // Forward migration of existing subscriptions, without changing their keys or cutoff.
  const legacy = await env.DB.prepare("SELECT endpoint FROM push_subscriptions WHERE notification_version IS NULL LIMIT 40").bind().all<{endpoint:string}>();
  for (const s of legacy.results) await env.DB.prepare("UPDATE push_subscriptions SET notification_version=? WHERE endpoint=? AND notification_version IS NULL").bind(crypto.randomUUID(),s.endpoint).run();
  const rows = await env.DB.prepare(`SELECT s.*, MAX(json_extract(p.json, '$.publishedAt')) AS newest
    FROM push_subscriptions s JOIN briefings b ON b.owner_account_id = s.account_id
    JOIN accounts a ON a.id = s.account_id
    ${ELIGIBLE_PUSH_SQL}
    WHERE json_extract(p.json, '$.publishedAt') > s.last_notified_at
      AND json_extract(p.json, '$.publishedAt') <= ?
      AND json_extract(j.json,'$.state') IN ('PENDING','RUNNING')
      AND s.notification_version IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM v1_feed_documents r WHERE r.kind='browser_push_receipts' AND r.feed_id=e.feed_id AND json_extract(r.json,'$.editionId')=e.id AND json_extract(r.json,'$.subscriptionVersion')=s.notification_version)
      AND (s.lease_until IS NULL OR s.lease_until < ?)
    GROUP BY s.endpoint ORDER BY s.last_notified_at LIMIT 40`).bind(now, now).all<{
      endpoint: string; account_id: string; subscription_json: string; language: string; newest: string; last_notified_at: string; notification_version: string;
    }>();
  for (const row of rows.results) {
    const lease = new Date(Date.now() + 120_000).toISOString(), token = crypto.randomUUID();
    const claim = await env.DB.prepare("UPDATE push_subscriptions SET lease_until = ?, lease_token = ? WHERE endpoint = ? AND account_id = ? AND subscription_json = ? AND last_notified_at = ? AND notification_version = ? AND (lease_until IS NULL OR lease_until < ?)").bind(lease, token, row.endpoint, row.account_id, row.subscription_json, row.last_notified_at, row.notification_version, now).run();
    if (!claim.meta.changes) continue;
    let phase = "subscription";
    try {
      const subscription = subscriptionSchema.parse(JSON.parse(row.subscription_json));
      const body = row.language === "ar" ? "ملخص جديد جاهز في خلاصاتك." : row.language === "fr" ? "Un nouveau résumé est disponible dans vos fils." : "A new briefing is ready in your feeds.";
      phase = "payload";
      const payload = await buildPushPayload({ data: JSON.stringify({ title: "Distilled.news", body, url: "/", tag: "new-briefings" }), options: { ttl: 3600 } }, subscription,
        { publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY!, subject: env.VAPID_SUBJECT! });
      phase = "send";
      const response = await fetch(subscription.endpoint, { ...payload, redirect: "manual", signal: AbortSignal.timeout(10_000) });
      phase = "receipt";
      if (response.status === 404 || response.status === 410) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND lease_token = ?").bind(row.endpoint, token).run();
      } else if (response.ok) {
        await recordPushAcceptance(env.DB, row, token, new Date().toISOString());
      } else console.warn("Push delivery rejected", { status: response.status });
      await response.body?.cancel();
    } catch (error) {
      // Error messages may contain endpoint tokens or keys. Log only fixed stages
      // and known exception names; never include the subscription or raw error.
      const name = error instanceof Error ? error.name : "UnknownError";
      const errorType = ["Error", "TypeError", "SyntaxError", "ZodError", "DataError", "OperationError", "InvalidAccessError", "NotSupportedError", "AbortError", "TimeoutError"].includes(name) ? name : "UnknownError";
      console.warn("Push delivery failed; will retry after lease expires", { phase, errorType });
    }
  }
  await settlePushOutbox(env.DB, new Date().toISOString());
}

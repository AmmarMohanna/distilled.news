import { buildPushPayload } from "@block65/webcrypto-web-push";
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
  const rows = await env.DB.prepare(`SELECT s.*, MAX(e.published_at) AS newest
    FROM push_subscriptions s JOIN briefings b ON b.owner_account_id = s.account_id
    JOIN accounts a ON a.id = s.account_id
    JOIN briefing_editions e ON e.briefing_id = b.id
    WHERE e.status = 'published' AND e.published_at > s.last_notified_at AND e.published_at <= ?
      AND a.disabled_at IS NULL AND (s.lease_until IS NULL OR s.lease_until < ?)
    GROUP BY s.endpoint ORDER BY s.last_notified_at LIMIT 40`).bind(now, now).all<{
      endpoint: string; subscription_json: string; language: string; newest: string;
    }>();
  for (const row of rows.results) {
    const lease = new Date(Date.now() + 120_000).toISOString();
    const claim = await env.DB.prepare("UPDATE push_subscriptions SET lease_until = ? WHERE endpoint = ? AND (lease_until IS NULL OR lease_until < ?)").bind(lease, row.endpoint, now).run();
    if (!claim.meta.changes) continue;
    try {
      const subscription = subscriptionSchema.parse(JSON.parse(row.subscription_json));
      const body = row.language === "ar" ? "ملخص جديد جاهز في خلاصاتك." : row.language === "fr" ? "Un nouveau résumé est disponible dans vos fils." : "A new briefing is ready in your feeds.";
      const payload = await buildPushPayload({ data: JSON.stringify({ title: "Distilled.news", body, url: "/", tag: "new-briefings" }), options: { ttl: 3600 } }, subscription,
        { publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY!, subject: env.VAPID_SUBJECT! });
      const response = await fetch(subscription.endpoint, { ...payload, redirect: "error", signal: AbortSignal.timeout(10_000) });
      if (response.status === 404 || response.status === 410) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND lease_until = ?").bind(row.endpoint, lease).run();
      } else if (response.ok) {
        await env.DB.prepare("UPDATE push_subscriptions SET last_notified_at = ?, lease_until = NULL WHERE endpoint = ? AND lease_until = ?").bind(row.newest, row.endpoint, lease).run();
      } else console.warn("Push delivery rejected", { status: response.status });
      await response.body?.cancel();
    } catch { console.warn("Push delivery failed; will retry after lease expires"); }
  }
}

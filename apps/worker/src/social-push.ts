import { buildPushPayload } from "@block65/webcrypto-web-push";
import { pushConfigured, subscriptionSchema } from "./push";
import type { Env } from "./types";
import { ELIGIBLE_PUSH_SQL } from "./push-outbox";

const eligible = `
  FROM social_push_events evt
  JOIN briefings b ON b.id=evt.feed_id AND b.public_feed_enabled=1 AND b.paused=0
  JOIN accounts owner ON owner.id=b.owner_account_id AND owner.disabled_at IS NULL
  JOIN push_subscriptions s ON s.last_notified_at<evt.created_at AND s.account_id IN (
    SELECT a.account_id FROM account_star_alerts a
    WHERE evt.kind='briefing' AND a.feed_id=b.id AND a.started_at<evt.created_at
    UNION ALL
    SELECT f.follower_id FROM channel_follows f
    WHERE evt.kind<>'briefing' AND f.channel_id=owner.id AND (f.followed_at IS NULL OR f.followed_at<evt.created_at)
  )
  JOIN accounts reader ON reader.id=s.account_id AND reader.disabled_at IS NULL
  WHERE s.account_id<>owner.id AND s.notification_version IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM social_push_receipts r WHERE r.event_id=evt.id AND r.subscription_version=s.notification_version)
    AND (evt.kind<>'briefing' OR EXISTS (
      SELECT 1 FROM accounts a ${ELIGIBLE_PUSH_SQL} WHERE a.id=owner.id AND e.id=evt.edition_id
    ))`;

interface PushCandidate {
  id: string;
  kind: "feed-added" | "feed-edited" | "briefing";
  edition_id: string | null;
  endpoint: string;
  subscription_json: string;
  notification_version: string;
  language: string;
  username: string;
  slug: string;
  title: string;
}

function notificationBody(event: PushCandidate): string {
  const { kind, title, language, username } = event;
  if (kind === "briefing") return language === "fr" ? `Nouvelle actualit\u00e9 dans ${title}` : language === "ar" ? `\u0645\u0648\u062c\u0632 \u062c\u062f\u064a\u062f: ${title}` : `New briefing in ${title}`;
  const added = kind === "feed-added";
  if (language === "fr") return `@${username} a ${added ? "ajout\u00e9" : "modifi\u00e9"} ${title}`;
  if (language === "ar") return `@${username} ${added ? "\u0623\u0636\u0627\u0641" : "\u0639\u062f\u0651\u0644"} ${title}`;
  return `@${username} ${added ? "added" : "updated"} ${title}`;
}

export async function sendSocialNotifications(env: Env, now = new Date()): Promise<void> {
  if (!pushConfigured(env)) return;
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const candidates = await env.DB.prepare(`
    SELECT evt.id,evt.kind,evt.edition_id,s.endpoint,s.subscription_json,s.notification_version,s.language,owner.username,b.slug,b.title
    ${eligible}
      AND evt.created_at>=? AND evt.created_at<=? AND (s.lease_until IS NULL OR s.lease_until<?)
    ORDER BY evt.created_at,evt.id LIMIT 40`).bind(cutoff, nowIso, nowIso).all<PushCandidate>();
  const endpoints = new Set<string>();
  for (const event of candidates.results) {
    if (endpoints.has(event.endpoint)) continue;
    endpoints.add(event.endpoint);
    const token = crypto.randomUUID();
    const lease = new Date(Date.now() + 120_000).toISOString();
    const claim = await env.DB.prepare(`
      UPDATE push_subscriptions SET lease_token=?,lease_until=?
      WHERE endpoint=? AND notification_version=? AND (lease_until IS NULL OR lease_until<?)
        AND EXISTS (SELECT 1 ${eligible} AND evt.id=? AND s.endpoint=? AND s.notification_version=?)
      `).bind(token, lease, event.endpoint, event.notification_version, nowIso, event.id, event.endpoint, event.notification_version).run();
    if (!claim.meta.changes) continue;
    try {
      const subscription = subscriptionSchema.parse(JSON.parse(event.subscription_json));
      const feedUrl = `/${encodeURIComponent(event.username)}/${encodeURIComponent(event.slug)}/`;
      const url = event.edition_id ? `${feedUrl}briefing/${encodeURIComponent(event.edition_id)}/` : feedUrl;
      const payload = await buildPushPayload({
        data: JSON.stringify({ title: "Distilled.News", body: notificationBody(event), url, tag: `social-${event.id}` }),
        options: { ttl: 3600 }
      }, subscription, { publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY!, subject: env.VAPID_SUBJECT! });
      const response = await fetch(subscription.endpoint, { ...payload, redirect: "manual", signal: AbortSignal.timeout(10_000) });
      await response.body?.cancel();
      if (response.status === 404 || response.status === 410) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint=? AND notification_version=? AND lease_token=?")
          .bind(event.endpoint, event.notification_version, token).run();
      } else if (response.ok) {
        await env.DB.batch([
          env.DB.prepare(`INSERT OR IGNORE INTO social_push_receipts(event_id,subscription_version)
            SELECT ?,? WHERE EXISTS(SELECT 1 FROM push_subscriptions
              WHERE endpoint=? AND notification_version=? AND lease_token=? AND lease_until>?)`)
            .bind(event.id, event.notification_version, event.endpoint, event.notification_version, token, new Date().toISOString()),
          env.DB.prepare("UPDATE push_subscriptions SET lease_token=NULL,lease_until=NULL WHERE endpoint=? AND notification_version=? AND lease_token=?")
            .bind(event.endpoint, event.notification_version, token)
        ]);
      }
    } catch {
      console.warn("Social push delivery failed; will retry after lease expires");
    }
  }
  await env.DB.prepare("DELETE FROM social_push_events WHERE id IN (SELECT id FROM social_push_events WHERE created_at<? ORDER BY created_at LIMIT 100)")
    .bind(cutoff).run();
}

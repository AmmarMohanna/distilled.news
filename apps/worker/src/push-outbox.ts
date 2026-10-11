import { sha256 } from '@distilled/contracts';
/** Join publication's existing outbox; a saved draft/withdrawn edition is never eligible.
 * Browser pushes coalesce eligible editions per subscription, preserving the UI sender's behavior. */
export const ELIGIBLE_PUSH_SQL = `
 JOIN v1_feed_documents e ON e.feed_id=b.id AND e.kind='editions'
 JOIN v1_feed_documents j ON j.feed_id=e.feed_id AND j.kind='delivery_jobs' AND j.id=e.id
 JOIN v1_feed_documents p ON p.feed_id=e.feed_id AND p.kind='publication_status' AND p.id=e.id
 JOIN v1_feed_documents v ON v.feed_id=e.feed_id AND v.kind='fidelity_results'
   AND v.id=COALESCE(json_extract(e.json,'$.generation.verificationId'),json_extract(e.json,'$.selectionId'))
 JOIN v1_feed_documents l ON l.feed_id=e.feed_id AND l.kind='ledger_projections'
   AND l.id=json_array(e.id,'grounded-communication-ledger-v1')
 AND json_extract(p.json,'$.status')='PUBLISHED' AND json_extract(v.json,'$.passed')=1
 AND b.public_feed_enabled=1 AND a.disabled_at IS NULL`;
interface Subscription {endpoint:string;account_id:string;subscription_json:string;last_notified_at:string;newest:string;notification_version:string}
export async function pushSubscriptionIdentity(s:Pick<Subscription,'endpoint'|'account_id'|'subscription_json'|'notification_version'>):Promise<string> {
 return sha256(JSON.stringify([s.endpoint,s.account_id,s.subscription_json,s.notification_version]));
}
/** Receipts + subscription lease release commit together. A lost DB acknowledgement can
 * replay without sending again. Push service acceptance is NOT device/user receipt.
 * The onboarding cutoff is retained; receipts suppress replay so a later ledger
 * projection cannot be skipped by a newer edition watermark. A lost external response can still cause an at-least-once retry (stable browser tag). */
export async function recordPushAcceptance(db:D1Database,s:Subscription,token:string,now:string):Promise<void> {
 const fingerprint=await pushSubscriptionIdentity(s);
 const editions=await db.prepare(`SELECT e.id,e.feed_id FROM briefings b JOIN accounts a ON a.id=b.owner_account_id
 ${ELIGIBLE_PUSH_SQL} WHERE b.owner_account_id=? AND json_extract(p.json,'$.publishedAt')>?
 AND json_extract(p.json,'$.publishedAt')<=?
 AND NOT EXISTS(SELECT 1 FROM v1_feed_documents r WHERE r.kind='browser_push_receipts' AND r.feed_id=e.feed_id AND json_extract(r.json,'$.editionId')=e.id AND json_extract(r.json,'$.subscriptionVersion')=?)
 ORDER BY json_extract(p.json,'$.publishedAt'),e.id LIMIT 40`).bind(s.account_id,s.last_notified_at,s.newest,s.notification_version).all<{id:string;feed_id:string}>();
 const statements=editions.results.map(e=>db.prepare(`INSERT INTO v1_feed_documents(kind,id,feed_id,json)
 SELECT 'browser_push_receipts',?,?,? WHERE EXISTS(SELECT 1 FROM push_subscriptions
 WHERE endpoint=? AND account_id=? AND subscription_json=? AND notification_version=? AND lease_token=? AND lease_until>?)
 AND EXISTS(SELECT 1 FROM v1_feed_documents WHERE kind='publication_status' AND id=? AND feed_id=?
 AND json_extract(json,'$.status')='PUBLISHED') ON CONFLICT(kind,id) DO NOTHING`)
 .bind(JSON.stringify([e.id,fingerprint]),e.feed_id,JSON.stringify({editionId:e.id,subscriptionFingerprint:fingerprint,subscriptionVersion:s.notification_version,state:'ACCEPTED_BY_PUSH_SERVICE',acceptedAt:now}),s.endpoint,s.account_id,s.subscription_json,s.notification_version,token,now,e.id,e.feed_id));
 statements.push(db.prepare(`UPDATE push_subscriptions SET lease_until=NULL,lease_token=NULL
 WHERE endpoint=? AND account_id=? AND subscription_json=? AND notification_version=? AND lease_token=? AND lease_until>?`)
 .bind(s.endpoint,s.account_id,s.subscription_json,s.notification_version,token,now));
 await db.batch(statements);
}
/** A publication job is DONE only with durable acceptance receipts for every
 * currently eligible subscription. No subscription/configuration is not delivery. */
export async function settlePushOutbox(db:D1Database,now:string):Promise<void> {
 const jobs=await db.prepare(`SELECT e.id,e.feed_id,b.owner_account_id,json_extract(p.json,'$.publishedAt') AS published_at
 FROM briefings b JOIN accounts a ON a.id=b.owner_account_id ${ELIGIBLE_PUSH_SQL}
 WHERE json_extract(j.json,'$.state') IN ('PENDING','RUNNING') AND json_extract(p.json,'$.publishedAt')<=?
 AND EXISTS(SELECT 1 FROM v1_feed_documents r WHERE r.kind='browser_push_receipts' AND r.feed_id=e.feed_id AND json_extract(r.json,'$.editionId')=e.id)
 AND EXISTS(SELECT 1 FROM push_subscriptions s WHERE s.account_id=b.owner_account_id AND s.last_notified_at<json_extract(p.json,'$.publishedAt'))
 AND NOT EXISTS(SELECT 1 FROM push_subscriptions s WHERE s.account_id=b.owner_account_id AND s.last_notified_at<json_extract(p.json,'$.publishedAt') AND NOT EXISTS(
  SELECT 1 FROM v1_feed_documents r WHERE r.kind='browser_push_receipts' AND r.feed_id=e.feed_id AND json_extract(r.json,'$.editionId')=e.id
   AND json_extract(r.json,'$.subscriptionVersion')=s.notification_version AND json_extract(r.json,'$.state')='ACCEPTED_BY_PUSH_SERVICE'))
 ORDER BY json_extract(p.json,'$.publishedAt'),e.id LIMIT 40`).bind(now).all<{id:string;feed_id:string;owner_account_id:string;published_at:string}>();
 for(const job of jobs.results){
  // One atomic predicate checks every eligible current subscription against its
  // immutable receipt; no unbounded JS subscriber list or stale membership snapshot.
  await db.prepare(`UPDATE v1_feed_documents SET json=json_set(json,'$.state','DONE','$.attempts',MAX(COALESCE(json_extract(json,'$.attempts'),0),1),'$.completedAt',?,'$.deliveryChannel','BROWSER_PUSH','$.acceptance','PUSH_SERVICE')
   WHERE kind='delivery_jobs' AND id=? AND feed_id=? AND json_extract(json,'$.state') IN ('PENDING','RUNNING')
   AND EXISTS(SELECT 1 FROM v1_feed_documents WHERE kind='publication_status' AND id=? AND feed_id=? AND json_extract(json,'$.status')='PUBLISHED')
   AND EXISTS(SELECT 1 FROM briefings b JOIN accounts a ON a.id=b.owner_account_id WHERE b.id=? AND b.owner_account_id=? AND b.public_feed_enabled=1 AND a.disabled_at IS NULL)
   AND EXISTS(SELECT 1 FROM push_subscriptions WHERE account_id=? AND last_notified_at<?)
   AND NOT EXISTS(SELECT 1 FROM push_subscriptions s WHERE s.account_id=? AND s.last_notified_at<? AND NOT EXISTS(
    SELECT 1 FROM v1_feed_documents r WHERE r.kind='browser_push_receipts' AND r.feed_id=?
     AND json_extract(r.json,'$.editionId')=? AND json_extract(r.json,'$.subscriptionVersion')=s.notification_version
     AND json_extract(r.json,'$.state')='ACCEPTED_BY_PUSH_SERVICE'))`)
   .bind(now,job.id,job.feed_id,job.id,job.feed_id,job.feed_id,job.owner_account_id,job.owner_account_id,job.published_at,job.owner_account_id,job.published_at,job.feed_id,job.id).run();
 }
}

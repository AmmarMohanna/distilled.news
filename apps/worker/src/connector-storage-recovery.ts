import {readStorageHealth} from './storage-maintenance';

const CANARY_MAX_ALLOCATION = 9_500_000_000;
const CANARY_COOLDOWN_MS = 15 * 60_000;
const activeRssSource = `SELECT 1 FROM sources s JOIN briefings b ON b.id=s.briefing_id
  WHERE s.enabled=1 AND s.collection_owner='connector' AND b.paused=0
    AND s.provider='rss' AND s.kind='rss_feed'`;

/** Prove that a real bounded write can reuse allocated pages. This grants a
 * single named source admission and leaves the general 9 GB guard closed. */
export async function authorizeConnectorStorageCanary(db:D1Database,feedId:string,sourceId:string,now=Date.now()) {
  const health=await readStorageHealth(db);
  if (health.status!=='critical'||health.allocatedBytes>=CANARY_MAX_ALLOCATION) return false;
  const source=await db.prepare(`${activeRssSource} AND s.id=? AND b.id=?`).bind(sourceId,feedId).first();
  if (!source) return false;
  const token=crypto.randomUUID();
  const lock=await db.prepare(`INSERT INTO connector_storage_recovery(id,token,feed_id,source_id,until_ms,state,allocated_bytes)
    VALUES(1,?,?,?,?,'PROBING',?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,feed_id=excluded.feed_id,
    source_id=excluded.source_id,until_ms=excluded.until_ms,state=excluded.state,allocated_bytes=excluded.allocated_bytes
    WHERE connector_storage_recovery.until_ms<=? RETURNING id`)
    .bind(token,feedId,sourceId,now+CANARY_COOLDOWN_MS,health.allocatedBytes,now).first();
  if (!lock) return false;
  try {
    // Keep fixed-size writes and their cleanup in one atomic batch. Probe
    // below the cap even if all probe pages need new allocation.
    const [write]=await db.batch([
      db.prepare('INSERT INTO connector_storage_probe SELECT value,zeroblob(524288) FROM json_each(?)').bind('[1,2,3,4,5,6,7,8]'),
      db.prepare('DELETE FROM connector_storage_probe')
    ]);
    const after=await readStorageHealth(db);
    if (!write.success||write.meta.changes!==8||after.allocatedBytes>health.allocatedBytes||
        !Number.isFinite(write.meta.size_after)||write.meta.size_after>health.allocatedBytes) return false;
    return !!await db.prepare("UPDATE connector_storage_recovery SET state='READY',allocated_bytes=? WHERE id=1 AND token=? AND state='PROBING' RETURNING id")
      .bind(after.allocatedBytes,token).first();
  } catch { return false; }
}

export async function consumeConnectorStorageCanary(db:D1Database,feedId:string,sourceIds:string[],allocatedBytes:number,now=Date.now()) {
  if (allocatedBytes>=CANARY_MAX_ALLOCATION||!sourceIds.length) return undefined;
  const row=await db.prepare(`UPDATE connector_storage_recovery SET state='CONSUMED' WHERE id=1 AND state='READY'
    AND feed_id=? AND source_id IN (SELECT value FROM json_each(?)) AND allocated_bytes=? AND until_ms>?
    AND EXISTS (${activeRssSource} AND s.id=connector_storage_recovery.source_id AND b.id=connector_storage_recovery.feed_id)
    RETURNING source_id`).bind(feedId,JSON.stringify(sourceIds),allocatedBytes,now).first<{source_id:string}>();
  return row?.source_id;
}

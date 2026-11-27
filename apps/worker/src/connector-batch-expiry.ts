import {validBatchArchiveKey} from './connector-batch-uploads';
import {batchObservationCountSql,batchProposalCountSql} from './connector-health';
import type {Env} from './types';

interface DueBatch {
  kind:'rss'|'provider'; feed_id:string; feed_source_id:string; batch_id:string; archive_ref:string|null;
}

/** Replace the payload with its health summary before deleting its private object.
 * The indexed expiry row also serves as the deletion journal across restarts. */
export async function expireCompletedConnectorBatches(env:Pick<Env,'DB'|'RAW_ARCHIVE'>,now = new Date()) {
  const {DB:db,RAW_ARCHIVE:bucket} = env;
  const at = Math.floor(now.getTime()/1000);
  const due = await db.prepare('SELECT * FROM connector_batch_expiry WHERE expires_at<=? AND retry_after<=? AND quarantine_reason IS NULL ORDER BY expires_at LIMIT 25')
    .bind(at,at).all<DueBatch>();
  let expired = 0;
  for (const batch of due.results) {
    const {kind,feed_id:feedId,feed_source_id:sourceId,batch_id:batchId} = batch;
    const keys = [kind,feedId,sourceId,batchId];
    const where = 'WHERE kind=? AND feed_id=? AND feed_source_id=? AND batch_id=? AND quarantine_reason IS NULL';
    const [table,id] = kind === 'rss' ? ['connector_batches','handoff_id'] : ['connector_provider_batches','batch_key'];
    try {
      const row = await db.prepare(`SELECT json_valid(data) AS valid,
        CASE WHEN json_valid(data) THEN json_extract(data,'$.archiveRef') END AS ref,
        CASE WHEN json_valid(data) THEN json_type(data,'$.archiveRef') END AS ref_type
        FROM ${table} WHERE feed_id=? AND feed_source_id=? AND ${id}=?`).bind(feedId,sourceId,batchId)
        .first<{valid:number;ref:unknown;ref_type:string|null}>();
      const ref = batch.archive_ref ?? row?.ref ?? null;
      const invalidReference=(batch.archive_ref !== null || row?.ref_type != null) &&
        (!await validBatchArchiveKey(ref,feedId,sourceId) || (row?.ref_type != null && row.ref !== ref));
      if (row?.valid===0 || invalidReference) {
        await db.prepare(`UPDATE connector_batch_expiry SET quarantine_reason=? ${where}`)
          .bind(row?.valid===0?'INVALID_BATCH_JSON':'INVALID_ARCHIVE_REFERENCE',...keys).run();
        console.warn('Connector batch expiry quarantined an invalid record');
        continue;
      }
      const [claimed] = await db.batch([
        db.prepare(`UPDATE connector_batch_expiry SET archive_ref=?,retry_after=? ${where} AND retry_after<=?
          AND archive_ref IS ? AND ? IS (SELECT json_extract(data,'$.archiveRef') FROM ${table}
            WHERE feed_id=? AND feed_source_id=? AND ${id}=?) RETURNING batch_id`)
          .bind(ref,at+120,...keys,at,batch.archive_ref,row?.ref??null,feedId,sourceId,batchId),
        db.prepare(`UPDATE ${table} SET data=json_object('expired',json('true'),'providerId',json_extract(data,'$.providerId'),
          'request',json_object('coverage',json_extract(data,'$.request.coverage')),'observationCount',${batchObservationCountSql},'proposalCount',${batchProposalCountSql}),
          receipts='{"expired":true}' WHERE changes()=1 AND feed_id=? AND feed_source_id=? AND ${id}=? AND receipts IS NOT NULL
          AND json_extract(data,'$.expired') IS NOT 1`).bind(feedId,sourceId,batchId)
      ]);
      if (!claimed.results.length) continue;
      if (typeof ref === 'string') await bucket.delete(ref);
      await db.prepare(`DELETE FROM connector_batch_expiry ${where}`).bind(...keys).run();
      expired++;
    } catch { console.warn('Connector batch expiry deferred'); }
  }
  return expired;
}

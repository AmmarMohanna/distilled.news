import {sha256} from '@distilled/contracts';
import {CONNECTOR_BATCH_ARCHIVE_NAMESPACE} from '@distilled/connectors';
import {batchObservationCountSql,batchProposalCountSql} from './connector-health';
import type {Env} from './types';

interface DueBatch {
  kind:'rss'|'provider'; feed_id:string; feed_source_id:string; batch_id:string; archive_ref:string|null;
}

/** Replace the payload with its health summary before deleting its private object.
 * The indexed expiry row also serves as the deletion journal across restarts. */
export async function expireCompletedConnectorBatches(env:Pick<Env,'DB'|'RAW_ARCHIVE'>,now = new Date()) {
  const {DB:db,RAW_ARCHIVE:bucket} = env;
  const due = await db.prepare('SELECT * FROM connector_batch_expiry WHERE expires_at<=? ORDER BY expires_at LIMIT 25')
    .bind(Math.floor(now.getTime()/1000)).all<DueBatch>();
  let expired = 0;
  for (const batch of due.results) {
    const {kind,feed_id:feedId,feed_source_id:sourceId,batch_id:batchId} = batch;
    const keys = [kind,feedId,sourceId,batchId];
    const where = 'WHERE kind=? AND feed_id=? AND feed_source_id=? AND batch_id=?';
    const [table,id] = kind === 'rss' ? ['connector_batches','handoff_id'] : ['connector_provider_batches','batch_key'];
    let ref = batch.archive_ref;
    if (!ref) {
      const [, saved] = await db.batch([
        db.prepare(`UPDATE connector_batch_expiry SET archive_ref=(SELECT json_extract(data,'$.archiveRef') FROM ${table}
          WHERE feed_id=? AND feed_source_id=? AND ${id}=?) ${where} AND archive_ref IS NULL`).bind(feedId,sourceId,batchId,...keys),
        db.prepare(`SELECT archive_ref FROM connector_batch_expiry ${where}`).bind(...keys),
        db.prepare(`UPDATE ${table} SET data=json_object('expired',json('true'),'providerId',json_extract(data,'$.providerId'),
          'request',json_object('coverage',json_extract(data,'$.request.coverage')),'observationCount',${batchObservationCountSql},'proposalCount',${batchProposalCountSql}),
          receipts='{"expired":true}' WHERE feed_id=? AND feed_source_id=? AND ${id}=? AND receipts IS NOT NULL
          AND EXISTS(SELECT 1 FROM connector_batch_expiry ${where})`).bind(feedId,sourceId,batchId,...keys)
      ]);
      if (!saved.results.length) continue;
      ref = (saved.results[0] as {archive_ref:string|null}).archive_ref;
    }
    if (ref) {
      const prefix = `${CONNECTOR_BATCH_ARCHIVE_NAMESPACE}/${await sha256(JSON.stringify([feedId,sourceId,sourceId]))}/`;
      if (!ref.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(ref.slice(prefix.length))) throw new Error('INVALID_CONNECTOR_BATCH_ARCHIVE_KEY');
      await bucket.delete(ref);
    }
    await db.prepare(`DELETE FROM connector_batch_expiry ${where}`).bind(...keys).run();
    expired++;
  }
  return expired;
}

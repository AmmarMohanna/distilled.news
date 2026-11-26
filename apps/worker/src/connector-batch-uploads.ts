import {sha256} from '@distilled/contracts';
import {CONNECTOR_BATCH_ARCHIVE_NAMESPACE,TRACKED_CONNECTOR_BATCH_NAMESPACE,R2SourcePayloadStore,type SourceScope} from '@distilled/connectors';
import type {Env} from './types';

type UploadEnv = Pick<Env,'DB'|'RAW_ARCHIVE'>;
const GRACE_SECONDS = 86400;

export async function validBatchArchiveKey(key:unknown,feedId:string,sourceId:string) {
  if (typeof key !== 'string') return false;
  const scope = await sha256(JSON.stringify([feedId,sourceId,sourceId]));
  const legacy = `${CONNECTOR_BATCH_ARCHIVE_NAMESPACE}/${scope}/`;
  if (key.startsWith(legacy)) return /^[a-f0-9]{64}$/.test(key.slice(legacy.length));
  const tracked = `${TRACKED_CONNECTOR_BATCH_NAMESPACE}/${scope}/`;
  return key.startsWith(tracked) && /^[a-f0-9]{64}-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(key.slice(tracked.length));
}

export function connectorBatchPayloads({DB:db,RAW_ARCHIVE:bucket}:UploadEnv) {
  const legacy = new R2SourcePayloadStore(bucket,CONNECTOR_BATCH_ARCHIVE_NAMESPACE);
  return {
    async put(scope:SourceScope,bytes:Uint8Array,contentType:string) {
      const hash = await sha256(bytes);
      const prefix = await sha256(JSON.stringify([scope.feedId,scope.feedSourceId,scope.sourceId]));
      const ref = `${TRACKED_CONNECTOR_BATCH_NAMESPACE}/${prefix}/${hash}-${crypto.randomUUID()}`;
      await db.prepare("INSERT INTO connector_batch_uploads(object_key,feed_id,feed_source_id,state,cleanup_at) VALUES(?,?,?,'WRITING',unixepoch()+?)")
        .bind(ref,scope.feedId,scope.feedSourceId,GRACE_SECONDS).run();
      await bucket.put(ref,bytes,{onlyIf:{etagDoesNotMatch:'*'},sha256:hash,httpMetadata:{contentType}});
      await this.get(scope,ref);
      const verified = await db.prepare("UPDATE connector_batch_uploads SET state='VERIFIED' WHERE object_key=? AND state='WRITING' AND cleanup_at>unixepoch() RETURNING object_key").bind(ref).first();
      if (!verified) throw new Error('CONNECTOR_UPLOAD_EXPIRED');
      return {ref,hash};
    },
    async get(scope:SourceScope,ref:string) {
      if (ref.startsWith(CONNECTOR_BATCH_ARCHIVE_NAMESPACE+'/')) return legacy.get(scope,ref);
      if (!await validBatchArchiveKey(ref,scope.feedId,scope.feedSourceId)) throw new Error('INVALID_CONNECTOR_BATCH_ARCHIVE_KEY');
      const object = await bucket.get(ref);
      if (!object) throw new Error('PAYLOAD_MISSING');
      const bytes = new Uint8Array(await object.arrayBuffer());
      if (await sha256(bytes) !== ref.split('/').at(-1)?.slice(0,64)) throw new Error('PAYLOAD_INTEGRITY_FAILURE');
      return bytes;
    }
  };
}

export async function sweepConnectorBatchUploads({DB:db,RAW_ARCHIVE:bucket}:UploadEnv,now=new Date()) {
  const at = Math.floor(now.getTime()/1000);
  const claimed = await db.prepare(`UPDATE connector_batch_uploads SET state='DELETING',cleanup_at=? WHERE object_key IN (
    SELECT object_key FROM connector_batch_uploads WHERE state<>'QUARANTINED' AND cleanup_at<=? ORDER BY cleanup_at LIMIT 25
  ) RETURNING object_key,feed_id,feed_source_id`).bind(at+120,at).all<{object_key:string;feed_id:string;feed_source_id:string}>();
  let deleted=0;
  for (const row of claimed.results) {
    try {
      if (!row.object_key.startsWith(TRACKED_CONNECTOR_BATCH_NAMESPACE+'/') ||
          !await validBatchArchiveKey(row.object_key,row.feed_id,row.feed_source_id)) {
        await db.prepare("UPDATE connector_batch_uploads SET state='QUARANTINED' WHERE object_key=? AND state='DELETING'").bind(row.object_key).run();
        console.warn('Connector upload key quarantined');
        continue;
      }
      await bucket.delete(row.object_key);
      await db.prepare("DELETE FROM connector_batch_uploads WHERE object_key=? AND state='DELETING'").bind(row.object_key).run();
      deleted++;
    } catch { console.warn('Connector upload cleanup deferred'); }
  }
  return deleted;
}

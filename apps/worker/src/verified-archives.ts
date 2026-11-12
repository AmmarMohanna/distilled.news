import {sha256} from '@distilled/contracts';
import type {Env} from './types';

const PREFIX='operational-archives/verified/v1/';
const MAX_BYTES=4*1024*1024;
const GRACE_MS=86_400_000;
const CLEANUP_BATCH=5;
type ArchiveKind='EDITION'|'SEMANTIC_WAIT';
type ArchiveEnv=Pick<Env,'DB'|'RAW_ARCHIVE'>;

export interface VerifiedArchive {
  objectKey:string;
  sha256:string;
  bytes:number;
  schemaVersion:1;
}

function validObjectKey(key:string):boolean {
  return /^operational-archives\/verified\/v1\/(?:edition|semantic_wait)\/[a-f0-9]{64}\/[a-f0-9]{64}-[a-f0-9-]{36}\.json$/.test(key);
}

export async function readVerifiedArchive(bucket:R2Bucket,ref:VerifiedArchive):Promise<string> {
  if(ref.schemaVersion!==1||!validObjectKey(ref.objectKey)||!ref.objectKey.split('/').at(-1)?.startsWith(ref.sha256+'-')||
    !/^[a-f0-9]{64}$/.test(ref.sha256)||!Number.isSafeInteger(ref.bytes)||ref.bytes<1||ref.bytes>MAX_BYTES)
    throw Error('INVALID_ARCHIVE_REFERENCE');
  const object=await bucket.get(ref.objectKey);
  if(!object||object.size!==ref.bytes)throw Error('ARCHIVE_OBJECT_UNAVAILABLE');
  const bytes=new Uint8Array(await object.arrayBuffer());
  if(bytes.length!==ref.bytes||await sha256(bytes)!==ref.sha256)throw Error('ARCHIVE_CHECKSUM_MISMATCH');
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}

/** Register intent before I/O so a failed publication or lost response leaves
 * an exact, bounded orphan candidate. Each writer owns a unique object key. */
export async function stageVerifiedArchive(env:ArchiveEnv,kind:ArchiveKind,feedId:string,recordId:string,text:string):Promise<VerifiedArchive> {
  const bytes=new TextEncoder().encode(text);
  if(bytes.length<1||bytes.length>MAX_BYTES)throw Error('ARCHIVE_PAYLOAD_SIZE');
  const hash=await sha256(bytes),scope=await sha256(JSON.stringify([feedId,recordId]));
  const objectKey=`${PREFIX}${kind.toLowerCase()}/${scope}/${hash}-${crypto.randomUUID()}.json`;
  const ref:VerifiedArchive={objectKey,sha256:hash,bytes:bytes.length,schemaVersion:1};
  await env.DB.prepare(`INSERT INTO v1_verified_archives(object_key,kind,feed_id,record_id,sha256,byte_count,schema_version,state,cleanup_after_ms)
    VALUES(?,?,?,?,?,?,1,'WRITING',?)`).bind(objectKey,kind,feedId,recordId,hash,bytes.length,Date.now()+GRACE_MS).run();
  await env.RAW_ARCHIVE.put(objectKey,bytes,{onlyIf:{etagDoesNotMatch:'*'},sha256:hash,httpMetadata:{contentType:'application/json'}});
  if(await readVerifiedArchive(env.RAW_ARCHIVE,ref)!==text)throw Error('ARCHIVE_PAYLOAD_MISMATCH');
  const verifiedAt=Date.now();
  const accepted=await env.DB.prepare(`UPDATE v1_verified_archives SET state='VERIFIED',verified_ms=?
    WHERE object_key=? AND state='WRITING' AND cleanup_after_ms>? RETURNING object_key`)
    .bind(verifiedAt,objectKey,verifiedAt).first();
  if(!accepted)throw Error('ARCHIVE_INTENT_EXPIRED');
  return ref;
}

/** The database first fences attachment of the exact object. A crashed delete
 * is retried by key. A retained reference can never enter this transition. */
export async function sweepVerifiedArchiveOrphans(env:ArchiveEnv,now=new Date()):Promise<number> {
  const at=now.getTime();
  const claimed=await env.DB.prepare(`UPDATE v1_verified_archives SET state='DELETING',cleanup_after_ms=? WHERE object_key IN (
    SELECT a.object_key FROM v1_verified_archives a
    WHERE a.state IN ('WRITING','VERIFIED','DELETING') AND a.cleanup_after_ms<=?
      AND NOT EXISTS(SELECT 1 FROM v1_edition_delivery d WHERE d.object_key=a.object_key)
      AND NOT EXISTS(SELECT 1 FROM v1_semantic_wait_archive_refs r WHERE r.object_key=a.object_key)
    ORDER BY a.cleanup_after_ms,a.object_key LIMIT ?) RETURNING object_key`)
    .bind(at+120_000,at,CLEANUP_BATCH).all<{object_key:string}>();
  let deleted=0;
  for(const row of claimed.results){
    if(!validObjectKey(row.object_key))continue;
    try{
      await env.RAW_ARCHIVE.delete(row.object_key);
      await env.DB.prepare("DELETE FROM v1_verified_archives WHERE object_key=? AND state='DELETING'").bind(row.object_key).run();
      deleted++;
    }catch{console.warn('Verified archive orphan cleanup deferred');}
  }
  return deleted;
}

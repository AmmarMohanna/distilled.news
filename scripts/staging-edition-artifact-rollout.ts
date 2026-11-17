/** Staging-only qualification/backfill for an already published V3 edition.
 * No publication, evidence, paid receipt, or visibility state is changed. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {evaluationD1} from './validation-evaluation-d1.mjs';
import {buildEditionDeliveryPayload,publicV1Edition} from '../apps/worker/src/v1-intelligence/public-read';
import {stageVerifiedArchive} from '../apps/worker/src/verified-archives';
import {canonicalJson} from '../apps/worker/src/v1-intake/canonical';
import type {BriefingEditionRecord} from '../apps/worker/src/v1-intelligence/publication';
const ACCOUNT='e32b564514d4f9b9e383b7dd30dbb026',BUCKET='distilled-news-staging-raw';
const args=process.argv.slice(2),arg=(key:string)=>args[args.indexOf(key)+1];
if(!args.includes('--feed')||!arg('--feed'))throw Error('Use --feed <staging feed ID> [--edition <ID>] [--apply]');
const feedId=arg('--feed'),editionId=args.includes('--edition')?arg('--edition'):undefined;
const token=readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if(!token)throw Error('CLOUDFLARE_AUTH_REQUIRED');
const db=evaluationD1(token) as D1Database;
const r2=async(key:string,method='GET',body?:Uint8Array)=>{
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`,{method,headers:{authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:body as BodyInit}:{}),signal:AbortSignal.timeout(60000)});
 if(method==='GET'&&response.status===404)return null;
 if(!response.ok)throw Error(`STAGING_R2_${method}_HTTP_${response.status}`);
 return response;
};
const bucket={
 put:async(key:string,value:Uint8Array)=>{await r2(key,'PUT',value);return {key}},
 get:async(key:string)=>{const response=await r2(key);if(!response)return null;const bytes=await response.arrayBuffer();return {size:bytes.byteLength,arrayBuffer:async()=>bytes,text:async()=>new TextDecoder().decode(bytes)}}
} as unknown as R2Bucket;
const row=await db.prepare(`SELECT e.id,e.json,p.json status FROM v1_feed_documents e
 JOIN v1_feed_documents p ON p.kind='publication_status' AND p.id=e.id AND p.feed_id=e.feed_id
 WHERE e.feed_id=? AND e.kind='editions' AND json_extract(e.json,'$.engine')='v3'
 AND json_extract(p.json,'$.status')='PUBLISHED' AND (? IS NULL OR e.id=?)
 ORDER BY json_extract(e.json,'$.createdAt') DESC,e.id DESC LIMIT 1`).bind(feedId,editionId??null,editionId??null).first<{id:string;json:string;status:string}>();
if(!row)throw Error('NO_PUBLISHED_V3_EDITION_IN_STAGING_FEED');
const edition=JSON.parse(row.json) as BriefingEditionRecord;
const canonical=await publicV1Edition(db,row.id,undefined,feedId);
const payload=await buildEditionDeliveryPayload(db,edition);
if(!canonical||canonicalJson(canonical)!==canonicalJson(payload))throw Error('CANONICAL_PAYLOAD_MISMATCH');
const before=await db.prepare('SELECT object_key FROM v1_edition_delivery WHERE edition_id=? AND feed_id=?').bind(row.id,feedId).first<{object_key:string}>();
console.log(JSON.stringify({mode:args.includes('--apply')?'apply':'dry-run',feedId,editionId:row.id,bytes:new TextEncoder().encode(JSON.stringify(payload)).length,alreadyAttached:Boolean(before)}));
if(!args.includes('--apply'))process.exit(0);
if(!before){
 const ref=await stageVerifiedArchive({DB:db,RAW_ARCHIVE:bucket},'EDITION',feedId,row.id,JSON.stringify(payload));
 // Exact immutable edition + current publication status + existing delivery job
 // must still agree at attachment. Existing schema triggers verify the manifest.
 await db.prepare(`INSERT INTO v1_edition_delivery(edition_id,feed_id,object_key,created_at,published_at)
 SELECT e.id,e.feed_id,?,json_extract(e.json,'$.createdAt'),json_extract(p.json,'$.publishedAt')
 FROM v1_feed_documents e
 JOIN v1_feed_documents p ON p.kind='publication_status' AND p.id=e.id AND p.feed_id=e.feed_id
 JOIN v1_feed_documents j ON j.kind='delivery_jobs' AND j.id=e.id AND j.feed_id=e.feed_id
 WHERE e.kind='editions' AND e.id=? AND e.feed_id=? AND json_extract(e.json,'$.engine')='v3'
 AND json_extract(e.json,'$.createdAt')=? AND json_extract(p.json,'$.status')='PUBLISHED'
 AND json_extract(p.json,'$.publishedAt')=? AND NOT EXISTS(SELECT 1 FROM v1_edition_delivery WHERE edition_id=e.id)`)
 .bind(ref.objectKey,row.id,feedId,edition.createdAt,JSON.parse(row.status).publishedAt).run();
}
const attached=await db.prepare(`SELECT a.state,a.byte_count FROM v1_edition_delivery d JOIN v1_verified_archives a ON a.object_key=d.object_key WHERE d.edition_id=? AND d.feed_id=?`).bind(row.id,feedId).first();
if(!attached||attached.state!=='REFERENCED')throw Error('ARTIFACT_ATTACHMENT_FAILED');
// Qualification must exercise R2, not accidentally pass via canonical fallback.
const strictArchiveDb={...db,prepare(sql:string){if(sql.includes('e.json AS edition'))throw Error('ARTIFACT_FELL_BACK_TO_CANONICAL');return db.prepare(sql)}} as D1Database;
const archive=await publicV1Edition(strictArchiveDb,row.id,bucket,feedId);
if(canonicalJson(archive)!==canonicalJson(canonical))throw Error('ARTIFACT_READER_MISMATCH');
console.log(JSON.stringify({verified:true,feedId,editionId:row.id,manifest:attached,canonicalPayloadUnchanged:true}));

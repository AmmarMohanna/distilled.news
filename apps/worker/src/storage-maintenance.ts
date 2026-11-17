import type { Env } from './types';
import {expireSourceAssessments} from './source-assessment-cache';
import { semanticWaitRecord } from './v1-intelligence/semantic-wait-record';
import {stageVerifiedArchive} from './verified-archives';

const DAY = 86_400_000;
const STATE_KEY = 'storage:maintenance:v1';
type Row = { id: string; feed_id: string; json: string };
type SweepState = { cursor: string; assessmentCacheCursor?: string; archived: number; bytesOffloaded: number; expired: number; updatedAt: string };
const initialState = (): SweepState => ({ cursor: '', archived: 0, bytesOffloaded: 0, expired: 0, updatedAt: '' });

export async function readStorageHealth(db: D1Database) {
  // D1 restricts page/freelist pragmas. Its documented query metadata supplies
  // allocated size, not exact live bytes; never invent a free-space estimate.
  const measured = await db.prepare('SELECT 1').run();
  const allocatedBytes = measured.meta.size_after;
  if (!Number.isFinite(allocatedBytes)) throw Error('STORAGE_MEASUREMENT_UNAVAILABLE');
  // This is the supported paid-plan per-database limit, not an account quota.
  const capacityBytes = 10_000_000_000;
  return { allocatedBytes, capacityBytes, measurement: 'allocated_database_size',
    status: allocatedBytes >= capacityBytes * .9 ? 'critical' : allocatedBytes >= capacityBytes * .75 ? 'warning' : 'ok',
    measuredAt: new Date().toISOString() };
}

async function readState(db: D1Database): Promise<SweepState> {
  const row = await db.prepare('SELECT value FROM settings WHERE key=?').bind(STATE_KEY).first<{ value: string }>();
  return row ? { ...initialState(), ...JSON.parse(row.value) } : initialState();
}

async function saveState(db: D1Database, state: SweepState) {
  await db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(STATE_KEY, JSON.stringify(state), state.updatedAt).run();
}

async function archiveVerified(bucket: R2Bucket, text: string): Promise<{ key: string; sha256: string }> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const key = `operational-archives/semantic-waits/${sha256}.json`;
  await bucket.put(key, text, { httpMetadata: { contentType: 'application/json' }, customMetadata: { sha256 } });
  const stored = await bucket.get(key);
  if (!stored || await stored.text() !== text) throw Error('STORAGE_ARCHIVE_VERIFICATION_FAILED');
  return { key, sha256 };
}

/** Bounded, restart-safe sweep of unpaid wait diagnostics and expired
 * transport ownership. Verification-enabled maintenance retains the complete
 * diagnostic in a referenced immutable archive and keeps the compact SQL row. */
export async function runStorageMaintenance(env: Pick<Env, 'DB' | 'RAW_ARCHIVE' | 'VERIFIED_ARCHIVE_ENABLED'>, now = new Date(), options: {maxRecords?:number;budgetMs?:number} = {}) {
  const maxRecords=options.maxRecords??50,budgetMs=options.budgetMs??20_000;
  if(!Number.isSafeInteger(maxRecords)||maxRecords<1||maxRecords>50||!Number.isSafeInteger(budgetMs)||budgetMs<1||budgetMs>20_000)throw Error('INVALID_STORAGE_MAINTENANCE_LIMITS');
  const state = await readState(env.DB);
  try{state.assessmentCacheCursor=(await expireSourceAssessments(env.RAW_ARCHIVE,now.getTime(),state.assessmentCacheCursor)).cursor;}catch{console.warn('Source assessment cache cleanup deferred');}
  const deadline = Date.now() + budgetMs;
  const verified=env.VERIFIED_ARCHIVE_ENABLED==='true';
  let scanned = 0, archived = 0, bytesOffloaded = 0, expired = 0;
  // Keyset pagination bounds both response memory and SQL work. Each query reads
  // at most five D1 rows (each <=2 MB), even when the database is already full.
  for (let page = 0; page < 10 && scanned < maxRecords && Date.now() < deadline; page++) {
    const rows=await env.DB.prepare(`SELECT id,feed_id,json FROM v1_feed_documents WHERE kind='semantic_resource_waits' AND id>?
      ${verified?`AND json_extract(json,'$.status')='DEFERRED'
        AND json_extract(json,'$.usage.calls')=0 AND json_extract(json,'$.usage.costUsd')=0
        AND json_type(json,'$.usage.reported')='true' AND json_type(json,'$.input.state') IS NOT NULL
        AND json_extract(json,'$.archiveSchemaVersion') IS NOT 1`:''}
      ORDER BY id LIMIT 5`).bind(state.cursor).all<Row>();
    if (!rows.results.length) { state.cursor = ''; break; }
    for (const row of rows.results) {
      const value = JSON.parse(row.json);
      // Unknown/unreported provider outcomes retain every byte and reservation.
      if (value.usage?.calls === 0 && value.usage?.costUsd === 0 && value.usage?.reported === true && value.status === 'DEFERRED' && value.archiveSchemaVersion!==1) {
        const old = Number.isFinite(Date.parse(value.createdAt)) && Date.parse(value.createdAt) < now.getTime() - 30 * DAY;
        if(verified){
          if(value.input&&Object.hasOwn(value.input,'state')){
            const archive=await stageVerifiedArchive(env,'SEMANTIC_WAIT',row.feed_id,row.id,row.json);
            const compact=JSON.stringify({...semanticWaitRecord(value),archiveKey:archive.objectKey,archiveSha256:archive.sha256,archiveSchemaVersion:archive.schemaVersion});
            const replaced=env.DB.prepare(`INSERT OR REPLACE INTO v1_feed_documents(kind,id,feed_id,json)
              SELECT kind,id,feed_id,? FROM v1_feed_documents WHERE kind='semantic_resource_waits' AND id=? AND feed_id=? AND json=?`)
              .bind(compact,row.id,row.feed_id,row.json);
            const reference=env.DB.prepare(`INSERT INTO v1_semantic_wait_archive_refs(wait_id,feed_id,object_key)
              SELECT id,feed_id,? FROM v1_feed_documents WHERE kind='semantic_resource_waits' AND id=? AND feed_id=? AND json=?`)
              .bind(archive.objectKey,row.id,row.feed_id,compact);
            const [result]=await env.DB.batch([replaced,reference]);
            if(result.meta.changes){archived++;bytesOffloaded+=new TextEncoder().encode(row.json).length-new TextEncoder().encode(compact).length;}
          }
        }else if (old || value.input && Object.hasOwn(value.input, 'state')) {
          const archive = await archiveVerified(env.RAW_ARCHIVE, row.json);
          if (old) {
            const result = await env.DB.prepare("DELETE FROM v1_feed_documents WHERE kind='semantic_resource_waits' AND id=? AND json=?")
              .bind(row.id, row.json).run();
            if (result.meta.changes) { expired++; bytesOffloaded += new TextEncoder().encode(row.json).length; }
          } else {
            const compact = JSON.stringify({ ...semanticWaitRecord(value), archiveKey: archive.key, archiveSha256: archive.sha256 });
            // Replace only the exact verified row in one statement. A disappeared or newer row stays untouched.
            const replaced = await env.DB.prepare("INSERT OR REPLACE INTO v1_feed_documents(kind,id,feed_id,json) SELECT kind,id,feed_id,? FROM v1_feed_documents WHERE kind='semantic_resource_waits' AND id=? AND feed_id=? AND json=?")
              .bind(compact,row.id,row.feed_id,row.json).run();
            if (replaced.meta.changes) {
              archived++;
              bytesOffloaded += new TextEncoder().encode(row.json).length - new TextEncoder().encode(compact).length;
            }
          }
        }
      }
      scanned++; state.cursor = row.id;
      if (scanned >= maxRecords || Date.now() >= deadline) break;
    }
    // Checkpoint after each five records; a crash replays safely from R2 hashes.
    state.updatedAt = now.toISOString();
    await saveState(env.DB, { ...state, archived: state.archived + archived, bytesOffloaded: state.bytesOffloaded + bytesOffloaded, expired: state.expired + expired });
  }
  const cutoff = now.getTime() - DAY;
  // A token expired for a full day cannot own any live operation. Delete its
  // release with it atomically; retaining releases without leases is pointless.
  const leases=await env.DB.prepare(`WITH expired AS MATERIALIZED (
      SELECT id FROM v1_feed_documents WHERE kind='semantic_work_leases' AND json_extract(json,'$.leaseUntil')<?
      ORDER BY json_extract(json,'$.leaseUntil'),id LIMIT 100
    ) DELETE FROM v1_feed_documents WHERE kind IN ('semantic_work_leases','semantic_work_releases')
      AND id IN (SELECT id FROM expired) RETURNING kind`).bind(cutoff).all<{kind:string}>();
  const outcomes = await env.DB.prepare("DELETE FROM v1_queue_outcomes WHERE rowid IN (SELECT rowid FROM v1_queue_outcomes WHERE observed_at<? ORDER BY observed_at LIMIT 200)")
    .bind(new Date(now.getTime() - 30 * DAY).toISOString()).run();
  const result = { scanned, archived, bytesOffloaded, expired, expiredLeases: leases.results.filter(row=>row.kind==='semantic_work_leases').length, expiredQueueOutcomes: outcomes.meta.changes };
  state.archived += archived; state.bytesOffloaded += bytesOffloaded; state.expired += expired; state.updatedAt = now.toISOString();
  await saveState(env.DB, state);
  console.log(JSON.stringify({ event: 'storage_maintenance', ...result }));
  const health = await readStorageHealth(env.DB);
  if (health.status !== 'ok') console.warn(JSON.stringify({ event: 'storage_capacity_pressure', ...health }));
  return { ...result, total: state, health };
}

export async function storageMaintenanceStatus(env: Pick<Env, 'DB'>) {
  return { health: await readStorageHealth(env.DB), maintenance: await readState(env.DB) };
}

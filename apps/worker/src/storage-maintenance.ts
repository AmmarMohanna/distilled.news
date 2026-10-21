import type { Env } from './types';
import { semanticWaitRecord } from './v1-intelligence/semantic-wait-record';

const DAY = 86_400_000;
const STATE_KEY = 'storage:maintenance:v1';
type Row = { id: string; feed_id: string; json: string };
type SweepState = { cursor: string; archived: number; bytesOffloaded: number; expired: number; updatedAt: string };
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

/** Bounded, restart-safe sweep. Only unpaid wait diagnostics and expired
 * transport ownership are eligible. Paid-call identities and published support
 * never enter this cleanup path. No schema migration is needed to recover a full DB. */
export async function runStorageMaintenance(env: Pick<Env, 'DB' | 'RAW_ARCHIVE'>, now = new Date()) {
  const state = await readState(env.DB);
  const deadline = Date.now() + 20_000;
  let scanned = 0, archived = 0, bytesOffloaded = 0, expired = 0;
  // Keyset pagination bounds both response memory and SQL work. Each query reads
  // at most five D1 rows (each <=2 MB), even when the database is already full.
  for (let page = 0; page < 10 && Date.now() < deadline; page++) {
    const rows = await env.DB.prepare("SELECT id,feed_id,json FROM v1_feed_documents WHERE kind='semantic_resource_waits' AND id>? ORDER BY id LIMIT 5")
      .bind(state.cursor).all<Row>();
    if (!rows.results.length) { state.cursor = ''; break; }
    for (const row of rows.results) {
      const value = JSON.parse(row.json);
      // Unknown/unreported provider outcomes retain every byte and reservation.
      if (value.usage?.calls === 0 && value.usage?.costUsd === 0 && value.usage?.reported === true && value.status === 'DEFERRED') {
        const old = Number.isFinite(Date.parse(value.createdAt)) && Date.parse(value.createdAt) < now.getTime() - 30 * DAY;
        if (old || value.input && Object.hasOwn(value.input, 'state')) {
          const archive = await archiveVerified(env.RAW_ARCHIVE, row.json);
          if (old) {
            const result = await env.DB.prepare("DELETE FROM v1_feed_documents WHERE kind='semantic_resource_waits' AND id=? AND json=?")
              .bind(row.id, row.json).run();
            if (result.meta.changes) { expired++; bytesOffloaded += new TextEncoder().encode(row.json).length; }
          } else {
            const compact = JSON.stringify({ ...semanticWaitRecord(value), archiveKey: archive.key, archiveSha256: archive.sha256 });
            // Same-key replacement is atomic; deletion is conditional on the
            // exact archived value. A concurrent newer value is never replaced.
            const results = await env.DB.batch([
              env.DB.prepare("DELETE FROM v1_feed_documents WHERE kind='semantic_resource_waits' AND id=? AND json=?").bind(row.id, row.json),
              env.DB.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('semantic_resource_waits',?,?,?) ON CONFLICT(kind,id) DO NOTHING").bind(row.id, row.feed_id, compact)
            ]);
            if (results[0].meta.changes) {
              archived++;
              bytesOffloaded += new TextEncoder().encode(row.json).length - new TextEncoder().encode(compact).length;
            }
          }
        }
      }
      scanned++; state.cursor = row.id;
      if (Date.now() >= deadline) break;
    }
    // Checkpoint after each five records; a crash replays safely from R2 hashes.
    state.updatedAt = now.toISOString();
    await saveState(env.DB, { ...state, archived: state.archived + archived, bytesOffloaded: state.bytesOffloaded + bytesOffloaded, expired: state.expired + expired });
  }
  const cutoff = now.getTime() - DAY;
  // A token expired for a full day cannot own any live operation. Delete its
  // release with it atomically; retaining releases without leases is pointless.
  const leases = await env.DB.prepare("SELECT id FROM v1_feed_documents WHERE kind='semantic_work_leases' AND json_extract(json,'$.leaseUntil')<? ORDER BY json_extract(json,'$.leaseUntil'),id LIMIT 100")
    .bind(cutoff).all<{ id: string }>();
  for (let offset = 0; offset < leases.results.length; offset += 40) {
    const ids = leases.results.slice(offset, offset + 40).map(r => r.id);
    await env.DB.prepare(`DELETE FROM v1_feed_documents WHERE kind IN ('semantic_work_leases','semantic_work_releases') AND id IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids).run();
  }
  const outcomes = await env.DB.prepare("DELETE FROM v1_queue_outcomes WHERE rowid IN (SELECT rowid FROM v1_queue_outcomes WHERE observed_at<? LIMIT 200)")
    .bind(new Date(now.getTime() - 30 * DAY).toISOString()).run();
  const result = { scanned, archived, bytesOffloaded, expired, expiredLeases: leases.results.length, expiredQueueOutcomes: outcomes.meta.changes };
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

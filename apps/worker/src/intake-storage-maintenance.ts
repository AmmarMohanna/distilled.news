import {sha256} from '@distilled/contracts';

const CURSOR = 'storage:intake-handoff-cursor:v1';
const PAGE_SIZE = 25;
const COMPLETE = 'complete';

/** Keep the same replay identity while discarding the redundant request copy. */
export async function compactIntakeHandoffs(db: D1Database, now = new Date()) {
  const cursor = await db.prepare('SELECT value FROM settings WHERE key=?').bind(CURSOR).first<string>('value');
  if (cursor === COMPLETE) return {scanned:0,bytesRemoved:0};
  // Read IDs first and cap the number of bytes in each follow-up response.
  const page = await db.prepare('SELECT id FROM v1_handoffs WHERE id>? ORDER BY id LIMIT ?')
    .bind(cursor ?? '', PAGE_SIZE).all<{id:string}>();
  let bytesRemoved = 0;
  for (const {id} of page.results) {
    const old = await db.prepare("SELECT json, json_extract(json,'$.canonical') AS canonical FROM v1_handoffs WHERE id=? AND json_type(json,'$.canonical')='text'")
      .bind(id).first<{json:string;canonical:string}>();
    if (!old) continue;
    const compact = JSON.stringify({sha256:await sha256(old.canonical)});
    const result = await db.prepare('INSERT OR REPLACE INTO v1_handoffs(id,feed_source_id,item_key,json) SELECT id,feed_source_id,item_key,? FROM v1_handoffs WHERE id=? AND json=?')
      .bind(compact,id,old.json).run();
    if (result.meta.changes) bytesRemoved += new TextEncoder().encode(old.json).byteLength - compact.length;
  }
  const next = page.results.length === PAGE_SIZE ? page.results.at(-1)!.id : COMPLETE;
  await db.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE settings.value=?`)
    .bind(CURSOR,next,now.toISOString(),cursor ?? '').run();
  return {scanned:page.results.length,bytesRemoved};
}

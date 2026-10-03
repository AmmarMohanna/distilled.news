import { HandoffError } from '@distilled/contracts';
import { z } from 'zod';
import type { DownstreamJob, IntakeScope } from './types';

const scopeSchema = z.object({feedId:z.string().min(1),feedSourceId:z.string().min(1),sourceId:z.string().min(1),feedRevision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),enabled:z.boolean(),deletedAt:z.string().datetime().optional(),restrictions:z.object({startTime:z.string().datetime().optional(),endTime:z.string().datetime().optional(),publisherIds:z.array(z.string().min(1)).optional(),accountIds:z.array(z.string().min(1)).optional()}).strict()}).strict().refine(s=>!s.restrictions.startTime || !s.restrictions.endTime || Date.parse(s.restrictions.startTime)<Date.parse(s.restrictions.endTime));
export type Table = 'handoffs'|'inputs'|'candidates'|'intake_receipts'|'jobs'|'evidence'|'revisions'|'tombstones'|'acquired'|'evidence_receipts'|'conflicts'|'acquisition_results';
export interface Stored<T> { feedSourceId: string; value: T }
export interface ScopeSnapshot { scope: IntakeScope; epoch: number }
export interface Write { table: Table; id: string; itemKey?: string; value: unknown; immutable?: boolean }
const tables: Table[] = ['handoffs','inputs','candidates','intake_receipts','jobs','evidence','revisions','tombstones','acquired','evidence_receipts','conflicts','acquisition_results'];
function tableName(table: Table) { if(!tables.includes(table)) throw new Error('V1_INVALID_TABLE'); return `v1_${table}` }
export function itemId(feedSourceId:string, itemKey:string) { return JSON.stringify([feedSourceId,itemKey]) }

export class V1IntakeStore {
  constructor(readonly db: D1Database) {}
  async registerScope(input: IntakeScope): Promise<void> {
    const scope = scopeSchema.parse(input);
    await this.db.prepare('INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET feed_id=excluded.feed_id,source_id=excluded.source_id,json=excluded.json,epoch=v1_intake_scopes.epoch+1').bind(scope.feedSourceId,scope.feedId,scope.sourceId,JSON.stringify(scope)).run();
  }
  async snapshot(id:string): Promise<ScopeSnapshot> {
    const row=await this.db.prepare('SELECT json,epoch FROM v1_intake_scopes WHERE id=?').bind(id).first<{json:string;epoch:number}>();
    if(!row) throw new HandoffError('SCOPE_DENIED');
    const scope=JSON.parse(row.json) as IntakeScope;
    if(!scope.enabled || scope.deletedAt) throw new HandoffError('SCOPE_DENIED');
    return {scope,epoch:row.epoch};
  }
  async getScope(id:string):Promise<IntakeScope|undefined> {
    const row=await this.db.prepare('SELECT json FROM v1_intake_scopes WHERE id=?').bind(id).first<{json:string}>();
    return row ? JSON.parse(row.json) as IntakeScope : undefined;
  }
  async read<T>(table:Table,id:string):Promise<Stored<T>|undefined> {
    const row=await this.db.prepare(`SELECT feed_source_id,json FROM ${tableName(table)} WHERE id=?`).bind(id).first<{feed_source_id:string;json:string}>();
    return row ? {feedSourceId:row.feed_source_id,value:JSON.parse(row.json) as T} : undefined;
  }
  async list<T>(table:Table,feedSourceId:string):Promise<T[]> {
    const {results}=await this.db.prepare(`SELECT json FROM ${tableName(table)} WHERE feed_source_id=? ORDER BY id`).bind(feedSourceId).all<{json:string}>();
    return results.map(row=>JSON.parse(row.json) as T);
  }
  async listPendingJobs(id:string):Promise<DownstreamJob[]> { return (await this.list<DownstreamJob>('jobs',id)).filter(j=>j.state==='PENDING' && !j.exhausted) }
  /** Scope-wide epoch serializes decisions across item state and configuration changes.
   * The guard CHECK aborts the entire batch before any effects on a stale snapshot. */
  async commit(snapshot:ScopeSnapshot,writes:Write[]):Promise<boolean> {
    const nonce=crypto.randomUUID();
    const statements=[this.db.prepare('INSERT INTO v1_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM v1_intake_scopes WHERE id=? AND epoch=? AND json_extract(json,\'$.enabled\')=1 AND json_extract(json,\'$.deletedAt\') IS NULL) THEN 1 ELSE 0 END').bind(nonce,snapshot.scope.feedSourceId,snapshot.epoch)];
    for(const w of writes) statements.push(this.db.prepare(`INSERT INTO ${tableName(w.table)}(id,feed_source_id,item_key,json) VALUES(?,?,?,?) ${w.immutable?'ON CONFLICT(id) DO NOTHING':'ON CONFLICT(id) DO UPDATE SET json=excluded.json'}`).bind(w.id,snapshot.scope.feedSourceId,w.itemKey??null,JSON.stringify(w.value)));
    statements.push(this.db.prepare('UPDATE v1_intake_scopes SET epoch=epoch+1 WHERE id=?').bind(snapshot.scope.feedSourceId), this.db.prepare('DELETE FROM v1_transaction_guards WHERE id=?').bind(nonce));
    try { await this.db.batch(statements); return true }
    catch(error) {
      if(String(error).includes('CHECK constraint failed: v1_cas')) return false;
      if(String(error).includes('V1_IDEMPOTENCY')) throw new HandoffError('IDEMPOTENCY_CONFLICT');
      // Provider/database diagnostics can contain external text: never put them on the wire.
      throw new HandoffError('TEMPORARY_UNAVAILABLE');
    }
  }
}

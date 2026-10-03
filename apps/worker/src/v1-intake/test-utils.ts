import { readFileSync, existsSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import type { IntakeScope, IntakePolicy } from './types';
import { V1IntakeStore } from './store';
export const scopeFixture: IntakeScope = { feedId:'feed-1', feedSourceId:'feed-source-1', sourceId:'source-1', feedRevision:1, enabled:true, restrictions:{} };
export const testPolicy: IntakePolicy = {
  version:'v1', now:()=> '2026-10-03T12:00:00Z', factsFor:async()=> ({}),
  orderingFor:async()=> ({compareRevisions:(a,b)=> a.scheme===b.scheme && a.authority===b.authority && /^\d+$/.test(a.value) && /^\d+$/.test(b.value) ? BigInt(a.value)===BigInt(b.value)?0:BigInt(a.value)>BigInt(b.value)?1:-1 : null, authoritativeReplacementAllowed:false}),
  verifySuppliedContent:async()=> undefined
};
export async function createIntakeDatabase() {
  const mf = new Miniflare({modules:true, script:"export default {fetch(){return new Response('ok')}}", d1Databases:['DB']});
  const db = await mf.getD1Database('DB') as unknown as D1Database;
  const path = new URL('../../migrations/0035_v1_intake_evidence.sql', import.meta.url);
  if (existsSync(path)) await db.exec(readFileSync(path,'utf8').replace(/\r?\n/g,' '));
  return {db, dispose:()=>mf.dispose()};
}
export async function seedIntakeScope(store: V1IntakeStore) { await store.registerScope(scopeFixture) }

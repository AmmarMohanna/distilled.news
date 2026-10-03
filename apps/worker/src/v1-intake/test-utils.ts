import { readFileSync, existsSync,readdirSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { handoffFixture, hashContent, type ConnectorHandoffRequest, type NormalizedEvidenceItem, type EvidenceRevision } from '@distilled/contracts';
import type { IntakeScope, IntakePolicy } from './types';
import { itemId, V1IntakeStore } from './store';
export const scopeFixture: IntakeScope = { feedId:'feed-1', feedSourceId:'feed-source-1', sourceId:'source-1', feedRevision:1, enabled:true, restrictions:{} };
export const testPolicy: IntakePolicy = {
  version:'v1', now:()=> '2026-10-03T12:00:00Z', factsFor:async()=> ({}),
  orderingFor:async()=> ({compareRevisions:(a,b)=> a.scheme===b.scheme && a.authority===b.authority && /^\d+$/.test(a.value) && /^\d+$/.test(b.value) ? BigInt(a.value)===BigInt(b.value)?0:BigInt(a.value)>BigInt(b.value)?1:-1 : null, authoritativeReplacementAllowed:false}),
  verifySuppliedContent:async()=> undefined
};
export async function createIntakeDatabase(options:{product?:boolean}={}) {
  const mf = new Miniflare({modules:true, script:"export default {fetch(){return new Response('ok')}}", d1Databases:['DB']});
  const db = await mf.getD1Database('DB') as unknown as D1Database;
  for(const name of options.product?readdirSync(new URL('../../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort():['0035_v1_intake_evidence.sql','0036_v1_acquisition_results.sql','0037_v1_feed_intelligence.sql','0038_v1_publication_jobs.sql','0039_v1_product_sources.sql','0041_v1_briefing_outbox.sql','0042_v1_feed_versions.sql']) {
    const path = new URL(`../../migrations/${name}`, import.meta.url);
    if (existsSync(path)) {const sql=readFileSync(path,'utf8').replace(/^\s*--[^\n]*$/gm,'').replace(/\r?\n/g,' ').trim();if(sql) await db.exec(sql)}
  }
  return {db, dispose:()=>mf.dispose()};
}
export async function seedIntakeScope(store: V1IntakeStore) { await store.registerScope(scopeFixture) }
export function batchFixture(sequence=1):ConnectorHandoffRequest {
  const request=handoffFixture(); request.observations=request.observations.slice(0,1);
  request.handoffId=`handoff-${sequence}`; request.coverage.fetchStartSequence=sequence; request.coverage.fetchRunId=`fetch-${sequence}`; request.coverage.id=`coverage-${sequence}`;
  request.observations[0]={...request.observations[0],id:`observation-${sequence}`,fetchStartSequence:sequence,fetchRunId:`fetch-${sequence}`};
  request.proposals[0]={...request.proposals[0],observationId:`observation-${sequence}`,discoveryRunId:`fetch-${sequence}`};
  return request;
}
export async function seedCurrentEvidence(store:V1IntakeStore,body='A',sequence=10) {
  const id=itemId('feed-source-1','guid-1'),now=testPolicy.now();
  const hash=await hashContent({representation:'ARTICLE_EXCERPT',body});
  const evidence:NormalizedEvidenceItem={id,feedId:'feed-1',feedSourceId:'feed-source-1',sourceId:'source-1',sourceItemKey:'guid-1',state:'ACTIVE',currentRevisionId:'revision-seed',currentObservationId:'seed-observation',currentFetchStartSequence:sequence,firstSeenAt:now,updatedAt:now};
  const revision:EvidenceRevision={id:'revision-seed',evidenceId:id,feedId:'feed-1',revision:1,sourceObservationId:'seed-observation',acquiredContentId:'seed-content',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',body,contentHash:hash,fetchStartSequence:sequence,acceptedAt:now};
  await store.commit(await store.snapshot('feed-source-1'),[{table:'evidence',id,itemKey:'guid-1',value:evidence},{table:'revisions',id:revision.id,value:revision,immutable:true},{table:'candidates',id,itemKey:'guid-1',value:{id,feedId:'feed-1',feedSourceId:'feed-source-1',sourceId:'source-1',sourceItemKey:'guid-1',latestObservationId:'seed-observation',discoveredAt:now,intakePolicyVersion:'v1'}}]);
  return {evidence,revision,hash};
}

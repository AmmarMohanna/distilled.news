import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inspectProviderSchema,shareSchemaEnums} from '../apps/worker/src/provider-schema';
import {developmentReconciliationSchema,reconstructDevelopments} from '../apps/worker/src/v1-intelligence/development-reconciliation';
const read=(name:string)=>JSON.parse(readFileSync('benchmarks/'+name,'utf8'));
it('retains the resolved Laplace/Replit compaction and bounds development output at large evidence counts',()=>{
 const results=['laplace','replit'].map(name=>{const schema=read('blocked-schema-'+name+'.json'),old=inspectProviderSchema('openai/gpt-4.1-mini',schema),compacted=inspectProviderSchema('openai/gpt-4.1-mini',shareSchemaEnums(schema));expect(compacted.fits).toBe(true);return {name,originalEnumOccurrences:old.enumValues,compactedEnumOccurrences:compacted.enumValues,originalSha256:createHash('sha256').update(JSON.stringify(schema)).digest('hex')}});
 expect(results.map(r=>[r.originalEnumOccurrences,r.compactedEnumOccurrences])).toEqual([[2452,168],[1197,126]]);
 const sourceCounts=[48,126,1000,2000],scale=sourceCounts.map(count=>{
  const mentions:any=Array.from({length:count},(_,i)=>({id:'exact-canonical-claim-'+String(i).padStart(5,'0'),sourceText:'The council approved measure '+i+'.',reportingRole:'REPORTED_DEVELOPMENT',quantities:[],qualifiers:[],certainty:{hedges:[]}}));
  const group=(ids:string[])=>({claimMentionIds:ids,eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:[],entities:[],slots:[]});
  const packets:any=Array.from({length:Math.ceil(count/25)},(_,i)=>({groups:[group(mentions.slice(i*25,(i+1)*25).map((m:any)=>m.id))],backgroundMentionIds:[],provenance:{}}));
  const raw={confidence:.9,groups:[{developmentIds:packets.map((_:any,i:number)=>'p'+i+'d0'),eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:[],relationship:'SAME_OCCURRENCE',relatedDevelopmentIds:[]}]};
  const start=performance.now(),constructed=reconstructDevelopments(raw,packets,mentions,{candidates:[],storylineIds:[]} as any,{scorer:'OFFLINE_SYNTHETIC',policyVersion:'scale-test'}),mechanicalReconstructionMs=performance.now()-start;
  expect(constructed.groups[0].claimMentionIds).toEqual(mentions.map((m:any)=>m.id));const admission=inspectProviderSchema('openai/gpt-4.1-mini',developmentReconciliationSchema);expect(admission.fits).toBe(true);
  return {claimMentions:count,packetDevelopments:packets.length,oldAssignmentOutputBytes:JSON.stringify({confidence:.9,groups:[group(mentions.map((m:any)=>m.id))],backgroundMentionIds:[]}).length,newDevelopmentOutputBytes:JSON.stringify(raw).length,newEnumOccurrences:admission.enumValues,mechanicalReconstructionMs,missingEvidence:0,misassignedEvidence:0,labels:'Synthetic exact-membership fixture; no model quality claim'};
 });
 const success=read('private-publication-success-results.json');expect(success.published).toBe(true);expect(success.verification.contract).toBe('EVIDENCE_GROUNDED_V2');expect(success.verification.status).toBe('ACCEPT');expect(success.allChargesSettled).toBe(true);
 const privateRoot='../../.review-tmp/backend-briefing-review/.local-reports/single-feed-preflight/',artifactChecks=success.artifacts.map((a:any)=>{const path=privateRoot+a.name;return {name:a.name,present:existsSync(path),hashMatches:existsSync(path)?createHash('sha256').update(readFileSync(path)).digest('hex')===a.sha256:null}});for(const artifact of artifactChecks)if(artifact.present)expect(artifact.hashMatches).toBe(true);
 writeFileSync('benchmarks/parallel-saved-evidence-results.json',JSON.stringify({mode:'OFFLINE_SCHEMA_AND_MEMBERSHIP_REPLAY',paidProviderCalls:0,actualProviderCostUsd:0,savedSchemaCases:results,scale,savedV2:{published:success.published,contract:success.verification.contract,verdict:success.verification.status,reportSha256:createHash('sha256').update(readFileSync('benchmarks/private-publication-success-results.json')).digest('hex'),artifactChecks},limitations:['Frozen V2 receipts are historical regression evidence, not a new publication.','Private source artifacts are hash-checked when present and never copied into the feature branch.','Schema and mechanical replay do not establish new model grouping accuracy, latency or cost.']},null,2)+'\n');
});

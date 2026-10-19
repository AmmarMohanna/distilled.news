import {it,expect} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {constructionTransport,GROUP_OWNERSHIP_VERSION,MINIMAL_CONSTRUCTION_VERSION} from './construction-transport';
import {parseConstruction} from './semantic-construction';
import recorded from '../../../../benchmarks/fresh-private-staging-mission-results.json';
const root=new URL('../../../../.local-reports/single-feed-preflight/',import.meta.url);
const available=['fresh-final-readonly.json','fresh-evidence-after-recovery.json','fresh-semantic-review-state.json'].every(p=>existsSync(new URL(p,root)));
function saved(){
 const load=(name:string)=>{const b=readFileSync(new URL(name,root));expect(createHash('sha256').update(b).digest('hex')).toBe((recorded.privateEvidenceSha256 as Record<string,string>)[name]);return JSON.parse(b.toString('utf8'));};
 const snapshot=load('fresh-final-readonly.json'),revision=JSON.parse(load('fresh-evidence-after-recovery.json').result[0].results[0].json),mentions=snapshot.retained.result[0].results.map((r:any)=>JSON.parse(r.json));
 const results=load('fresh-semantic-review-state.json').result[0].results.filter((r:any)=>r.kind==='semantic_results').map((r:any)=>JSON.parse(r.json));
 for(const r of results){expect(r.input.state.events).toEqual([]);expect(r.input.state.storylines).toEqual([]);}
 return {revision,mentions,results,input:{revision,role:'REPORTED_DEVELOPMENT' as const,candidates:[],storylineIds:[]}};
}
it.skipIf(!available).each([0,1])('keeps saved rejected provider response %i rejected without rewriting evidence or receipts',index=>{
 const {mentions,input,results}=saved(),response=results[index].validationDiagnostic.response,before=JSON.stringify(response);
 try{parseConstruction(response,mentions,input,{scorer:'SAVED_REPLAY',policyVersion:'unchanged'});throw Error('UNSAFE_ACCEPTANCE')}catch(e){expect((e as any).binding?.invariant).toBe('STORYLINE_CLAIM_OWNERSHIP')}
 const wire=constructionTransport(mentions,input,{constructionOwnershipVersion:GROUP_OWNERSHIP_VERSION});expect(()=>wire.decode(response)).toThrow();expect(JSON.stringify(response)).toBe(before);
});
it.skipIf(!available)('accepts an explicitly owned governance passage while preserving the separate historical-study fact',()=>{
 const {mentions,input}=saved(),wire=constructionTransport(mentions,input,{constructionOwnershipVersion:GROUP_OWNERSHIP_VERSION});
 // Controlled structural positive, NOT a provider verdict or independently labeled semantic gold.
 const group=(groupId:string,indexes:number[])=>({groupId,occurrence:'Controlled structural fixture',eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:[],entities:[],slots:[],storylineState:{lifecycle:'ACTIVE',openQuestionMentionIds:indexes.includes(8)?['C8']:[],expectedNextDate:null}});
 const raw={confidence:1,dispositionByUnitId:Object.fromEntries(mentions.map((_:any,i:number)=>['C'+i,i===4?'G1':'G0'])),groups:[group('G0',[0,1,2,3,5,6,7,8]),group('G1',[4])]},decoded=wire.decode(raw);
 const value=parseConstruction(decoded,mentions,input,{scorer:'CONTROLLED_OFFLINE',policyVersion:GROUP_OWNERSHIP_VERSION});
 expect(value.groups[0].storylineState?.openQuestionMentionIds).toEqual([mentions[8].id]);expect(value.groups[1].claimMentionIds).toEqual([mentions[4].id]);
 expect(new Set(value.groups.flatMap(g=>g.claimMentionIds))).toEqual(new Set(mentions.map((m:any)=>m.id)));
 expect(wire.state.claimMentions[8]).toMatchObject({evidenceRevisionId:input.revision.id,text:mentions[8].sourceText,span:{field:'body',start:1001,end:1185}});
});

import latestRecorded from '../../../../benchmarks/group-ownership-live-attempt-results.json';
import finalRecorded from '../../../../benchmarks/claim-disposition-staging-attempt-results.json';
it.skipIf(!existsSync(new URL('group-ownership-attempt-evidence.json',root)))('replays both exact contradictory staging responses with all conflicts diagnosed',()=>{
 const bytes=readFileSync(new URL('group-ownership-attempt-evidence.json',root));expect(createHash('sha256').update(bytes).digest('hex')).toBe(latestRecorded.privateEvidenceSha256);
 const {mentions,input}=saved(),wire=constructionTransport(mentions,input,{constructionOwnershipVersion:GROUP_OWNERSHIP_VERSION});
 const records=JSON.parse(bytes.toString()).docs.result[0].results.filter((r:any)=>r.kind==='semantic_results'&&['237998','39a47b'].some(id=>r.id.startsWith(id)));
 expect(records).toHaveLength(2);
 for(const record of records){const raw=JSON.parse(record.json).validationDiagnostic.response,before=JSON.stringify(raw);try{wire.decode(raw);throw Error('UNSAFE_ACCEPTANCE')}catch(e){expect((e as any).mechanicalIssues).toEqual(expect.arrayContaining([expect.objectContaining({code:'CONFLICTING_DISPOSITIONS',unitId:'C6',observed:['G2','BACKGROUND']}),expect.objectContaining({code:'CONFLICTING_DISPOSITIONS',unitId:'C7',observed:['G3','BACKGROUND']})]))}expect(JSON.stringify(raw)).toBe(before)}
 expect(wire.state.connectedContext.some((b:any)=>b.unitIds.includes('C5')&&b.unitIds.includes('C6')&&b.text.includes('bolder approaches may be needed')&&b.text.includes('pursue them'))).toBe(true);
});
it.skipIf(!existsSync(new URL('claim-disposition-20261019-1-evidence.json',root)))('diagnoses all saved annotation errors together and accepts only explicit controlled minimal proposals',()=>{
 const bytes=readFileSync(new URL('claim-disposition-20261019-1-evidence.json',root));expect(createHash('sha256').update(bytes).digest('hex')).toBe(finalRecorded.privateEvidenceSha256);
 const {mentions,input}=saved(),wire=constructionTransport(mentions,input,{constructionOwnershipVersion:MINIMAL_CONSTRUCTION_VERSION});
 const results=JSON.parse(bytes.toString()).docs.result[0].results.filter((r:any)=>r.kind==='semantic_results').map((r:any)=>JSON.parse(r.json)).filter((r:any)=>r.input.state?.constructionOwnershipVersion===GROUP_OWNERSHIP_VERSION);expect(results).toHaveLength(2);
 for(const [index,result] of results.entries()){
  const raw=result.validationDiagnostic.response,before=JSON.stringify(raw);try{wire.decode(raw);throw Error('UNSAFE_ACCEPTANCE')}catch(e){const issues=(e as any).mechanicalIssues;expect(issues.filter((i:any)=>i.code==='SLOT_ENTITY_OWNERSHIP')).toHaveLength(3);expect(issues.some((i:any)=>i.code==='ENTITY_ALIAS_NOT_SOURCE')).toBe(true);expect(issues.some((i:any)=>i.code==='UNREQUESTED_ENRICHMENT')).toBe(true);if(index===0)expect(issues.some((i:any)=>i.code==='FOREIGN_GROUP_REFERENCE'&&i.unitId==='C8')).toBe(true)}expect(JSON.stringify(raw)).toBe(before);
  // Counterfactual fixture only: not runtime salvage or a compatible paid verdict.
  const proposal={...raw,groups:raw.groups.map(({entities:_,slots:__,storylineState:___,...g}:any)=>g)},construction=parseConstruction(wire.decode(proposal),mentions,input,{scorer:'CONTROLLED_OFFLINE',policyVersion:MINIMAL_CONSTRUCTION_VERSION});
  expect(construction.groups).toHaveLength(raw.groups.length);expect(new Set(construction.groups.flatMap(g=>g.claimMentionIds))).toEqual(new Set(mentions.map((m:any)=>m.id)));expect(construction.groups.every(g=>g.entities.length===0&&g.slots.length===0&&!g.storylineState)).toBe(true);
 }
 const announcement={confidence:1,groups:[{groupId:'G0',occurrence:'Anthropic announces a public-benefit fund',eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:['CHANGES_STATE']}],dispositionByUnitId:Object.fromEntries(mentions.map((_:any,i:number)=>['C'+i,'G0']))};
 const value=parseConstruction(wire.decode(announcement),mentions,input,{scorer:'CONTROLLED_OFFLINE',policyVersion:MINIMAL_CONSTRUCTION_VERSION});expect(value.groups).toHaveLength(1);expect(value.groups[0].claimMentionIds).toHaveLength(9);expect(wire.state.connectedContext.some((c:any)=>c.unitIds.includes('C5')&&c.unitIds.includes('C6'))).toBe(true);
});

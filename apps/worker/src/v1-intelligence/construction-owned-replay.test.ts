import {it,expect} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {constructionTransport,GROUP_OWNERSHIP_VERSION} from './construction-transport';
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
 const group=(groupId:string,indexes:number[])=>({groupId,ownedPassages:indexes.map(i=>({passageId:'C'+i,openQuestion:i===8,expectedNextDateText:null})),eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:[],entities:[],slots:[],storylineState:{lifecycle:'ACTIVE'}});
 const raw={confidence:1,backgroundMentionIds:[],groups:[group('G0',[0,1,2,3,5,6,7,8]),group('G1',[4])]},decoded=wire.decode(raw);
 const value=parseConstruction(decoded,mentions,input,{scorer:'CONTROLLED_OFFLINE',policyVersion:GROUP_OWNERSHIP_VERSION});
 expect(value.groups[0].storylineState?.openQuestionMentionIds).toEqual([mentions[8].id]);expect(value.groups[1].claimMentionIds).toEqual([mentions[4].id]);
 expect(new Set(value.groups.flatMap(g=>g.claimMentionIds))).toEqual(new Set(mentions.map((m:any)=>m.id)));
 expect(wire.state.claimMentions[8]).toMatchObject({evidenceRevisionId:input.revision.id,text:mentions[8].sourceText,span:{field:'body',start:1001,end:1185}});
});

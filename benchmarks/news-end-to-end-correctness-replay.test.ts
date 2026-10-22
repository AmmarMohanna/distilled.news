import {inspectProviderSchema} from '../apps/worker/src/provider-schema';
import {it,expect} from 'vitest';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {readStructuredStream} from '../apps/worker/src/provider-stream';
import {checkReaderFidelity} from '../apps/worker/src/v1-intelligence/fidelity';
import {v2EditorialRequest,decodeV2EditorialResponse,V2_WHOLE_PARENT_POLICY} from '../apps/worker/src/v1-intelligence/editorial-plan-v2';
const root='.local-reports/news-end-to-end',load=(f:string)=>JSON.parse(readFileSync(root+'/'+f,'utf8'));
const available=existsSync(root+'/openrouter-47423a9d9625e61b96a3-response.json');
it.skipIf(!available)('traces the actual Anthropic false merge and Replit false storyline to the saved model choices',async()=>{
 for(const [key,relation,target] of [['47423a9d9625e61b96a3','SAME_EVENT','E0'],['e7b2ee5056489c747276','NEW_EVENT_EXISTING_STORYLINE','L0']]){
  const saved=load('openrouter-'+key+'-response.json'),intent=load('openrouter-'+key+'-intent.json');
  const parsed=await readStructuredStream(new Response(saved.raw,{headers:{'content-type':'text/event-stream'}}),async()=>{});
  const body=JSON.parse(parsed.choices[0].message.content),group=body.groups[0];expect(group.structuralRelation).toBe(relation);
  if(relation==='SAME_EVENT'){expect(group.eventId).toBe(target);expect(intent.payload.events.find((e:any)=>e.id===target).state).toContain('Replit makes OpenAI');expect(intent.payload.source.title).toContain('Anthropic');}
  else {expect(group.storylineId).toBe(target);expect(intent.payload.storylines.find((s:any)=>s.id===target).state).toContain('Laplace');}
 }
});
it.skipIf(!available)('rejects the exact saved operational-agents false ACCEPT without calling any model',()=>{
 const saved=load('openrouter-downstream-control.json'),story=saved.draft.stories[0],facts=story.claims[0].support.map((s:any,i:number)=>({id:'fact_'+i,text:s.quote,evidenceRevisionIds:[s.evidenceRevisionId]}));
 expect(saved.decision.status).toBe('ACCEPT');
 const permissive=facts.map((f:any)=>({factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Historical permissive ACCEPT'}));
 expect(checkReaderFidelity(story.claims.map((c:any)=>c.text),facts,facts,true,{checks:permissive}).failures.some(f=>f.code==='UNSUPPORTED_ACTION_STRENGTH'&&f.value?.includes('IN_DEVELOPMENT'))).toBe(true);
});
it.skipIf(!available)('re-encodes every actual editorial parent as a required schema slot without changing saved judgments or evidence',async()=>{
 const saved=load('openrouter-195802d1580e83b79bb4-response.json');const parsed=await readStructuredStream(new Response(saved.raw,{headers:{'content-type':'text/event-stream'}}),async()=>{});
 const raw=JSON.parse(parsed.choices[0].message.content);
 const shortlist=readdirSync(root).filter(n=>n.startsWith('openrouter-checkpoint-')).map(load).find(x=>x.stage==='SHORTLIST').value;
 const accepted=decodeV2EditorialResponse({value:raw},shortlist,V2_WHOLE_PARENT_POLICY),before=JSON.stringify(shortlist),request=v2EditorialRequest(shortlist,{title:'AI industry news',interests:['AI']},'COMPLETE');
 expect(inspectProviderSchema('openai/gpt-4.1',request.schema).fits).toBe(true);
 const keyed:any={stories:{},obligations:accepted.obligations};
 for(const [i,c] of shortlist.candidates.entries()){
  const story=accepted.stories.find((s:any)=>s.targetVersionId===c.targetVersionId)!;const {validation,mustIncludeFactIds,...rest}=story;
  keyed.stories['candidate_'+(i+1)]={...rest,validation:{factDecisions:Object.fromEntries(c.facts.map((fact:any,j:number)=>{const p=validation!.propositions.find((p:any)=>p.parentFactId===fact.id)!;const d=validation!.dispositions.find((d:any)=>d.propositionId===p.id)!;const {propositionId,...decision}=d;return ['fact_'+(j+1),decision]}))}};
 }
 const result=decodeV2EditorialResponse({value:keyed},shortlist,request.state.sourceAnchorPolicy);
 expect(result.stories.map(s=>[...s.mustIncludeFactIds].sort())).toEqual(accepted.stories.map(s=>[...s.mustIncludeFactIds].sort()));expect(JSON.stringify(shortlist)).toBe(before);
 expect(result.stories.reduce((n,s)=>n+s.validation!.propositions.length,0)).toBe(shortlist.candidates.reduce((n:number,c:any)=>n+c.facts.length,0));
 delete keyed.stories.candidate_1.validation.factDecisions.fact_1;
 expect(()=>decodeV2EditorialResponse({value:keyed},shortlist,request.state.sourceAnchorPolicy)).toThrow('SEMANTIC_EDITORIAL_REJECTED');
});

import {ASYNC_MODEL_CALL_MS} from './operation-timing';
import {z} from 'zod';
import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {durableSemanticOperation} from './semantic-operations';
import type {V1FeedStore} from './store';
import type {ShortlistRecord} from './shortlist';
import type {StrongSemanticModel} from './semantic-model';
const theme=z.object({childIds:z.array(z.string()).min(1),understanding:z.string(),significance:z.string(),relevance:z.string(),novelty:z.string(),uncertainty:z.string()}).strict();
const synopsis=z.object({themes:z.array(theme).min(1),guidance:z.string()}).strict();
export type EditorialSynopsis=z.infer<typeof synopsis>;
export interface GlobalNode {id:string;level:number;childIds:string[];targetVersionIds:string[];synopsis:EditorialSynopsis;operationId:string}
/** Synopses are comparative editorial judgments, never approved writer facts.
 * Every child remains linked to its complete immutable source-backed dossier.
 * Final candidate decisions inspect their original facts plus global context. */
export async function prepareGlobalEditorialContext(store:V1FeedStore,shortlist:ShortlistRecord,strong:StrongSemanticModel,leaves:ShortlistRecord[],now:string,deadlineMs:number):Promise<{root?:GlobalNode;nodes:GlobalNode[];operationIds:string[];reason?:string;pending?:{targetVersionIds:string[];reason:string}[]}> {
 const pending:{targetVersionIds:string[];reason:string}[]=[],nodes:GlobalNode[]=[],operationIds:string[]=[],policy='global-editorial-context-v1',feed=await store.getFeed(shortlist.feedId);
 const schema=(ids:string[])=>({type:'object',additionalProperties:false,required:['themes','guidance'],properties:{guidance:{type:'string'},themes:{type:'array',minItems:1,items:{type:'object',additionalProperties:false,required:['childIds','understanding','significance','relevance','novelty','uncertainty'],properties:{childIds:{type:'array',minItems:1,items:{type:'string',enum:ids}},...Object.fromEntries(['understanding','significance','relevance','novelty','uncertainty'].map(k=>[k,{type:'string'}]))}}}}});
 const stateFor=(children:{id:string;value:unknown}[],level:number)=>({instruction:'Build global comparative editorial context for this Feed. Account for EVERY child, including uncertain and less urgent developments. Relevance is fit to the FULL interests, independent of urgency or product-launch status. Old reporting is not repetition without communicated history. Describe significance, consequences and reader value comparatively; preserve attribution, contradictions, uncertainty and corrections. Do not impose story quotas or select winners per batch. Do not invent factual developments. These are editorial judgments; final decisions will inspect original source-backed facts. Themes may overlap, but every child must remain represented.',feed:feed?{title:feed.title,interests:feed.interests,geography:feed.geography}:undefined,bootstrap:shortlist.bootstrap,level,unresolved:pending,incompleteCoverageInstruction:'Unresolved children have no accepted comparative context. Do not label them unimportant, irrelevant or repeated. Their original work stays durable; independent supported developments may continue.',children});
 const execute=async(children:{id:string;value:unknown;targets:string[]}[],level:number)=>{
  const state=stateFor(children.map(({id,value})=>({id,value})),level),wire=schema(children.map(c=>c.id)),id=await sha256(canonicalJson({feedId:shortlist.feedId,feedRevision:shortlist.feedRevision,communicationFingerprint:shortlist.communicationFingerprint,model:strong.model,policy,level,children:children.map(c=>c.id)}));
  const op={feedId:shortlist.feedId,feedRevision:shortlist.feedRevision,evidenceRevisionIds:shortlist.evidenceRevisionIds,kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:policy,model:strong.model,budgetKey:'editorial-context:'+id,state};
  const prior=await store.read<any>(shortlist.feedId,'semantic_results',await sha256(canonicalJson(op)));
  if(!prior&&Date.now()+ASYNC_MODEL_CALL_MS>deadlineMs)return {reason:'EDITORIAL_EXECUTION_YIELD'};
  const result=await durableSemanticOperation(store,op,async()=>{const response=await strong.complete(shortlist.feedId,'COMPARATIVE_EDITORIAL_PLAN',state,wire),value=synopsis.parse(response.value),allowed=new Set(children.map(c=>c.id)),covered=new Set(value.themes.flatMap(t=>t.childIds));if([...covered].some(id=>!allowed.has(id))||[...allowed].some(id=>!covered.has(id)))throw Error('SEMANTIC_EDITORIAL_CONTEXT_REFERENCE_INVALID');return {value,usage:response.usage}},now,()=>strong.usage(),{operationAdmission:strong.admission?.(state,wire,'COMPARATIVE_EDITORIAL_PLAN'),reuseContext:{state}});
  if(result.usage.calls>0&&!operationIds.includes(result.id))operationIds.push(result.id);
  if(result.status!=='SUCCEEDED'||!result.value)return {reason:result.failure??'EDITORIAL_CONTEXT_UNRESOLVED'};
  const node:GlobalNode={id,level,childIds:children.map(c=>c.id),targetVersionIds:children.flatMap(c=>c.targets),synopsis:result.value,operationId:result.id};nodes.push(node);return {node};
 };
 let frontier:GlobalNode[]=[];
 for(const leaf of leaves){const result=await execute(leaf.candidates.map(c=>({id:c.targetVersionId,value:{targetType:c.targetType,sourceTitles:c.sourceTitles,facts:c.facts,readerState:c.readerState,flags:c.flags,effects:c.effects,protectedReasons:c.protectedReasons,history:leaf.ledger.filter(e=>e.eventIds.includes(c.stableTargetId)||Boolean(c.storylineId&&e.storylineIds.includes(c.storylineId))||leaf.obligations.some(o=>c.correctionObligationIds.includes(o.id)&&o.ledgerEntryId===e.id)),obligations:leaf.obligations.filter(o=>c.correctionObligationIds.includes(o.id))},targets:[c.targetVersionId]})),0);if(!result.node){pending.push({targetVersionIds:leaf.candidates.map(c=>c.targetVersionId),reason:result.reason??'EDITORIAL_CONTEXT_UNRESOLVED'});continue}frontier.push(result.node)}
 if(!frontier.length)return {nodes,operationIds,pending,reason:pending[0]?.reason??'EDITORIAL_CONTEXT_UNRESOLVED'};
 let level=1;
 while(frontier.length>1){
  const batches:GlobalNode[][]=[];let pending:GlobalNode[]=[];
  for(const node of frontier){const proposed=[...pending,node],children=proposed.map(n=>({id:n.id,value:n.synopsis}));if(pending.length&&!strong.admission?.(stateFor(children,level),schema(children.map(c=>c.id)),'COMPARATIVE_EDITORIAL_PLAN').fits){batches.push(pending);pending=[]}pending.push(node)}if(pending.length)batches.push(pending);
  if(batches.length===frontier.length)return {nodes,operationIds,reason:'EDITORIAL_GLOBAL_RECONCILIATION_CAPACITY_WAIT'};
  const next:GlobalNode[]=[];
  for(const batch of batches){if(batch.length===1){next.push(batch[0]);continue}const result=await execute(batch.map(n=>({id:n.id,value:n.synopsis,targets:n.targetVersionIds})),level);if(!result.node)return {nodes,operationIds,reason:result.reason};next.push(result.node)}frontier=next;level++;
 }
 return {root:frontier[0],nodes,operationIds,pending};
}

import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {expandEditorialInput} from './editorial-transport';
import type {SemanticOperationInput,SemanticOperationResult} from './semantic-operations';
import type {V1FeedStore} from './store';
const blockers=['IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE','TITLE_EXTRACTION_PENDING'];
/** A resolved semantic blocker is a new question, not a retry of the old paid
 * deferral. Cosmetic transport/ranking changes and UNKNOWN work never qualify. */
export async function settledEditorialBlockerResolved(store:V1FeedStore,prior:SemanticOperationInput,next:SemanticOperationInput):Promise<boolean>{
 if(prior.kind!=='COMPARATIVE_EDITORIAL_PLAN'||next.kind!==prior.kind||prior.feedId!==next.feedId||prior.feedRevision!==next.feedRevision||prior.model!==next.model||prior.policyVersion!==next.policyVersion||prior.budgetKey!==next.budgetKey||canonicalJson([...prior.evidenceRevisionIds].sort())!==canonicalJson([...next.evidenceRevisionIds].sort()))return false;
 const before=expandEditorialInput(prior.state) as any,after=expandEditorialInput(next.state) as any;
 if(!Array.isArray(before?.candidates)||!Array.isArray(after?.candidates)||before.candidates.length!==after.candidates.length)return false;
 let resolved=false;
 for(let i=0;i<before.candidates.length;i++){
  const oldFlags: string[]=before.candidates[i].flags??[],newFlags: string[]=after.candidates[i].flags??[];
  if(newFlags.some(f=>!oldFlags.includes(f)))return false;
  const removed=oldFlags.filter(f=>!newFlags.includes(f));
  if(removed.some(f=>!blockers.includes(f)&&f!=='PROVISIONAL'))return false;
  if(removed.includes('PROVISIONAL')&&!removed.some(f=>blockers.includes(f)))return false;
 }
 const context=(value:any)=>({feed:value.feed,window:value.window,bootstrap:value.bootstrap,budget:value.budget,communicationCapacity:value.communicationCapacity,comparativeContext:value.comparativeContext,ledger:value.ledger,obligations:value.obligations,candidates:value.candidates.map((c:any,i:number)=>{
  const old=before.candidates[i],oldBlocks=(old.flags??[]).filter((f:string)=>blockers.includes(f)),currentBlocks=(after.candidates[i]?.flags??[]).filter((f:string)=>blockers.includes(f));
  if(oldBlocks.length&&!currentBlocks.length)resolved=true;
  return {targetType:c.targetType,targetVersionId:c.targetVersionId,stableTargetId:c.stableTargetId,storylineId:c.storylineId,evidenceRevisionIds:c.evidenceRevisionIds,facts:c.facts,readerState:c.readerState,sourceTitles:c.sourceTitles,effects:(c.effects??[]).filter((e:string)=>e!=='CORROBORATES').sort(),protectedReasons:c.protectedReasons,correctionObligationIds:c.correctionObligationIds,flags:(c.flags??[]).filter((f:string)=>!blockers.includes(f)&&f!=='PROVISIONAL').sort()};
 })});
 const oldContext=context(before),newContext=context(after);if(!resolved){console.warn(JSON.stringify({type:'V1_EDITORIAL_BLOCKER_SUCCESSOR_DENIED',feedId:prior.feedId,reason:'NO_RESOLVED_BLOCKER',candidateCount:before.candidates.length}));return false;}
 if(canonicalJson(oldContext)!==canonicalJson(newContext)){console.warn(JSON.stringify({type:'V1_EDITORIAL_BLOCKER_SUCCESSOR_CONTEXT_CHANGED',feedId:prior.feedId,changedFields:Object.keys(oldContext).filter(k=>canonicalJson((oldContext as any)[k])!==canonicalJson((newContext as any)[k])),candidateChangeCount:oldContext.candidates.filter((c:any,i:number)=>canonicalJson(c)!==canonicalJson(newContext.candidates[i])).length,candidateChanges:oldContext.candidates.flatMap((c:any,i:number)=>Object.keys(c).filter(k=>canonicalJson(c[k])!==canonicalJson((newContext.candidates[i] as any)?.[k])).map(field=>({index:i,field}))).slice(0,10)}));return false;}
 const id=await sha256(canonicalJson(prior)),intent=await store.read<{input:SemanticOperationInput;token:string}>(prior.feedId,'semantic_intents',id);
 if(!intent?.token||canonicalJson(intent.input)!==canonicalJson(prior)){console.warn(JSON.stringify({type:'V1_EDITORIAL_BLOCKER_SUCCESSOR_DENIED',feedId:prior.feedId,reason:'INTENT_BINDING'}));return false;}
 const result=await store.read<SemanticOperationResult<{stories:{decision:string}[]}>>(prior.feedId,'semantic_results',id)??await store.read<SemanticOperationResult<{stories:{decision:string}[]}>&{token:string}>(prior.feedId,'semantic_settlements',id);
 if(result?.status!=='SUCCEEDED'||!result.usage.reported||result.usage.calls!==1||canonicalJson(result.input)!==canonicalJson(prior)||!result.value?.stories?.length||result.value.stories.some(s=>s.decision!=='DEFER')){console.warn(JSON.stringify({type:'V1_EDITORIAL_BLOCKER_SUCCESSOR_DENIED',feedId:prior.feedId,reason:'UNSETTLED_OR_NONDEFER_RESULT',status:result?.status,failure:result?.failure,reported:result?.usage.reported,calls:result?.usage.calls,decisions:result?.value?.stories?.map(s=>s.decision)}));return false;}
 const financial=await store.db.prepare('SELECT s.reported,s.cost_usd FROM v1_model_spending_reservations r JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.id=? AND r.token=?').bind('semantic_intents:'+id,intent.token).first<{reported:number;cost_usd:number}>();
 const known=financial?.reported===1&&Number.isFinite(financial.cost_usd)&&financial.cost_usd>=0;if(!known)console.warn(JSON.stringify({type:'V1_EDITORIAL_BLOCKER_SUCCESSOR_DENIED',feedId:prior.feedId,reason:'UNSETTLED_FINANCIAL_RECEIPT'}));return known;
}

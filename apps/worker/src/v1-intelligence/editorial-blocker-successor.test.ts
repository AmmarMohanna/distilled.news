import {expect,it} from 'vitest';
import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {settledEditorialBlockerResolved} from './editorial-blocker-successor';
import type {SemanticOperationInput} from './semantic-operations';
import type {V1FeedStore} from './store';
async function fixture(flags=['IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE']){
 const prior:SemanticOperationInput={feedId:'feed',feedRevision:1,evidenceRevisionIds:['revision'],kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:'policy',model:'model',budgetKey:'window',state:{window:{end:'2026-10-14T18:00:00Z'},candidates:[{targetType:'EVENT',targetVersionId:'target',stableTargetId:'event',evidenceRevisionIds:['revision'],facts:[{id:'fact',text:'Supported policy change.',certainty:{kind:'CONFIRMED'}}],flags,readerState:'UNSEEN',correctionObligationIds:['obligation']}],ledger:[{id:'history',claimText:'Earlier withdrawn prose.'}],obligations:[{id:'obligation',kind:'PUBLICATION_WITHDRAWAL'}]}};
 const next=structuredClone(prior);(next.state as any).candidates[0].flags=[];
 const id=await sha256(canonicalJson(prior)),intent={input:prior,token:'owner'},result={input:prior,status:'SUCCEEDED',usage:{calls:1,reported:true,costUsd:.001},value:{stories:[{decision:'DEFER'}]}},financial={reported:1,cost_usd:.001};
 const store={read:async(_feed:string,kind:string,key:string)=>key===id?kind==='semantic_intents'?intent:kind==='semantic_results'?result:undefined:undefined,db:{prepare:()=>({bind:(key:string,token:string)=>{expect(key).toBe('semantic_intents:'+id);expect(token).toBe('owner');return {first:async()=>financial}}})}} as unknown as V1FeedStore;
 return {prior,next,intent,result,financial,store};
}
it('a financially settled all-DEFER plan can be reconsidered only after its unchanged supported context loses a real blocker',async()=>{const f=await fixture();expect(await settledEditorialBlockerResolved(f.store,f.prior,f.next)).toBe(true);expect(f.result.value.stories).toEqual([{decision:'DEFER'}]);expect(f.financial.cost_usd).toBe(.001)});
it('resolved high-consequence identity may lose PROVISIONAL, but losing PROVISIONAL alone never authorizes a successor',async()=>{const f=await fixture(['IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE','PROVISIONAL']);expect(await settledEditorialBlockerResolved(f.store,f.prior,f.next)).toBe(true);const g=await fixture(['PROVISIONAL']);expect(await settledEditorialBlockerResolved(g.store,g.prior,g.next)).toBe(false)});
it.each(['unknown','unreported','unsettled','selected','empty'] as const)('%s cannot authorize another paid operation',async mode=>{const f=await fixture();if(mode==='unknown')f.result.status='DEFERRED';if(mode==='unreported')f.result.usage.reported=false;if(mode==='unsettled')f.financial.reported=0;if(mode==='selected')f.result.value.stories[0].decision='SELECT';if(mode==='empty')f.result.value.stories=[];expect(await settledEditorialBlockerResolved(f.store,f.prior,f.next)).toBe(false)});
it.each(['unchanged','format','fact','ledger','evidence','model','feedRevision','ownership'] as const)('%s does not pass the narrow blocker-resolution exception',async mode=>{
 const f=await fixture(),state=f.next.state as any;
 if(mode==='unchanged'||mode==='format')state.candidates[0].flags=['IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE'];
 if(mode==='format')state.instruction='Different transport prose.';
 if(mode==='fact')state.candidates[0].facts[0].text='Unsupported replacement fact.';
 if(mode==='ledger')state.ledger[0].claimText='Changed reader history.';
 if(mode==='evidence')f.next.evidenceRevisionIds=['other-revision'];
 if(mode==='model')f.next.model='other-model';
 if(mode==='feedRevision')f.next.feedRevision=2;
 if(mode==='ownership')state.candidates[0].stableTargetId='another-event';
 expect(await settledEditorialBlockerResolved(f.store,f.prior,f.next)).toBe(false);
});

it.each(['newBlocker','newProvisional','protectedReasons','effects','budget','comparativeContext'] as const)('%s cannot be hidden by a resolved blocker',async mode=>{
 const f=await fixture(),state=f.next.state as any;
 if(mode==='newBlocker')state.candidates[0].flags=['TITLE_EXTRACTION_PENDING'];
 if(mode==='newProvisional')state.candidates[0].flags=['PROVISIONAL'];
 if(mode==='protectedReasons')state.candidates[0].protectedReasons=['CORRECTION_OBLIGATION'];
 if(mode==='effects')state.candidates[0].effects=['CONTRADICTS'];
 if(mode==='budget')state.budget={mode:'CHANGED'};
 if(mode==='comparativeContext')state.comparativeContext={history:'changed'};
 expect(await settledEditorialBlockerResolved(f.store,f.prior,f.next)).toBe(false);
});

it('identity resolution may establish corroboration of identical facts without changing protected effects',async()=>{const f=await fixture();(f.next.state as any).candidates[0].effects=['CORROBORATES'];expect(await settledEditorialBlockerResolved(f.store,f.prior,f.next)).toBe(true)});

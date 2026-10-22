import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {canonicalJson} from '../v1-intake/canonical';
import {FeedTransaction,V1FeedStore,type DocumentKind} from './store';
import {feedFixture} from './test-utils';
import {findSemanticReuse,semanticQuestion} from './semantic-settlement';
import {SemanticContentionError,type SemanticIntent,type SemanticOperationInput,type SemanticOperationResult} from './semantic-operations';

let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
const now='2026-10-03T12:00:00Z',usage={calls:1,costUsd:.001,reported:true};
beforeEach(async()=>{ctx=await createIntakeDatabase();store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)},30000);
afterEach(async()=>{vi.restoreAllMocks();await ctx.dispose()},30000);
const input=(revision='revision'):SemanticOperationInput=>({feedId:'feed-1',feedRevision:1,evidenceRevisionIds:[revision],kind:'SEMANTIC_CONSTRUCTION',policyVersion:'policy',model:'model',budgetKey:'day-2',state:{source:{text:'Current evidence'},events:[{id:'event',versionId:'v1'}],memory:[],claimMentions:[{id:'mention',text:'Supported fact'}]}});
const intent=(id:string,i:SemanticOperationInput,extra:Partial<SemanticIntent>={}):SemanticIntent=>({id,feedId:'feed-1',input:i,token:'owner-'+id,leaseUntil:0,reservedCostUsd:.02,createdAt:now,compatibilityHash:'old-context',...extra});
const result=(i:SemanticIntent,extra:Partial<SemanticOperationResult>={}):SemanticOperationResult=>({id:i.id,feedId:'feed-1',input:i.input,status:'SUCCEEDED',value:{answer:i.id},usage,latencyMs:1,createdAt:now,...extra});
async function seed(kind:DocumentKind,values:unknown[],feedId='feed-1'){
 if(values.length)await ctx.db.batch(values.map(value=>ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind(kind,(value as {id:string}).id,feedId,JSON.stringify(value))));
}
const transaction=async()=>new FeedTransaction(store,await store.snapshot('feed-1'));

// Frozen pre-paging algorithm. Its eager materialization remains test-only so
// differential fixtures protect UNKNOWN fences and exact replay decisions.
async function eagerReuse(tx:FeedTransaction,i:SemanticOperationInput,hash?:string):Promise<SemanticOperationResult|undefined>{
 const rows=await tx.store.db.prepare("SELECT d.json FROM v1_feed_documents d WHERE d.feed_id=? AND d.kind='semantic_intents' AND EXISTS(SELECT 1 FROM json_each(d.json,'$.input.evidenceRevisionIds') e WHERE e.value=?) AND json_extract(d.json,'$.input.kind')=?").bind(i.feedId,i.evidenceRevisionIds[0],i.kind).all<{json:string}>();
 const intents=rows.results.map(row=>JSON.parse(row.json) as SemanticIntent);
 await tx.preload('semantic_results',intents.map(p=>p.id));await tx.preload('semantic_settlements',intents.map(p=>p.id));
 for(const p of intents){
  const saved=await tx.read<SemanticOperationResult>('semantic_results',p.id),settled=await tx.read<SemanticOperationResult&{token:string}>('semantic_settlements',p.id);
  const r=saved??(settled?.usage.reported&&settled.token===p.token?settled:undefined);
  if(!r?.usage.reported){
   const sameQuestion=canonicalJson(semanticQuestion(p.input))===canonicalJson(semanticQuestion(i));
   const versions=(state:any)=>({events:(state?.events??[]).map((e:any)=>[e.id,e.versionId]).sort(),memory:(state?.memory??[]).map((m:any)=>[m.id,m.versionId]).sort()});
   const mentions=(state:any)=>Array.isArray(state?.claimMentions)?state.claimMentions.map((m:any)=>[m.id,m.text]).sort():null;
   const sameConstruction=mentions(p.input.state)!==null&&canonicalJson(mentions(p.input.state))===canonicalJson(mentions(i.state))&&i.kind==='SEMANTIC_CONSTRUCTION'&&p.input.model===i.model&&p.input.feedRevision===i.feedRevision&&p.input.policyVersion===i.policyVersion&&canonicalJson(versions(p.input.state))===canonicalJson(versions(i.state));
   const samePublication=i.kind.startsWith('PUBLICATION_')&&(i.state as any)?.publicationScope&&canonicalJson((i.state as any).publicationScope)===canonicalJson((p.input.state as any)?.publicationScope)&&p.input.model===i.model&&p.input.feedRevision===i.feedRevision;
   if(!r&&p.leaseUntil>Date.now()){if(sameQuestion||sameConstruction||samePublication||hash&&p.compatibilityHash===hash)throw new SemanticContentionError();continue}
   if(!p.compatibilityHash||sameQuestion||sameConstruction||samePublication||p.compatibilityHash===hash){
    const fenced:SemanticOperationResult={...(r??{id:p.id,feedId:i.feedId,input:p.input,status:'DEFERRED' as const,usage:{calls:1,costUsd:p.reservedCostUsd,reported:false},latencyMs:0,createdAt:p.createdAt}),status:'DEFERRED',failure:'SEMANTIC_OUTCOME_UNKNOWN'};
    if(!r)await tx.write('semantic_results',p.id,fenced);return fenced;
   }
  }
  if(r?.status==='SUCCEEDED'&&hash&&p.compatibilityHash===hash)return r;
  if(i.kind==='SEMANTIC_CONSTRUCTION'&&r?.usage.reported&&r.usage.calls===1&&['SEMANTIC_CONSTRUCTION_REJECTED','SEMANTIC_MODEL_OUTPUT_CONTINUATION_REQUIRED'].includes(r.failure??'')&&hash&&p.compatibilityHash===hash)return r;
 }
 return undefined;
}

it('finds a late reusable answer without retaining every historical graph in the transaction cache',async()=>{
 const i=input(),intents=Array.from({length:13},(_,n)=>intent('history-'+String(n).padStart(2,'0'),{...i,state:{...(i.state as object),retainedGraph:'Historical graph. '.repeat(1200)}},{compatibilityHash:n===12?'current-context':'old-context'}));
 await seed('semantic_intents',intents);await seed('semantic_results',intents.map(p=>result(p)));
 const reference=await eagerReuse(await transaction(),i,'current-context');
 expect(reference?.id).toBe('history-12');
 const tx=await transaction(),readMany=vi.spyOn(store,'readMany');
 expect(await findSemanticReuse(tx,i,'current-context')).toEqual(reference);
 // A subsequent ordinary read must perform its own lookup: historical payloads
 // must not survive the scan in the transaction's permanent immutable cache.
 const before=tx.metrics.documentReads;expect(await tx.read('semantic_results','history-00')).toMatchObject({id:'history-00'});
 expect(tx.metrics.documentReads-before).toBe(1);
 expect(readMany.mock.calls.length).toBeGreaterThan(0);
 expect(readMany.mock.calls.every(([,kind,ids])=>['semantic_intents','semantic_results','semantic_settlements'].includes(kind)&&ids.length<=4)).toBe(true);
 expect(tx.writes.size).toBe(0);
},30000);

it('preserves replay, rejection, UNKNOWN, settlement-token and live-intent decisions against the eager algorithm',async()=>{
 const cases=[
  {name:'success',hash:'matching',reported:true},
  {name:'reported-rejection',hash:'matching',reported:true,failure:'SEMANTIC_CONSTRUCTION_REJECTED'},
  {name:'continuation',hash:'matching',reported:true,failure:'SEMANTIC_MODEL_OUTPUT_CONTINUATION_REQUIRED'},
  {name:'unknown',hash:'matching',reported:false,failure:'SEMANTIC_MODEL_TIMEOUT'},
  {name:'legacy-missing-result',hash:undefined,missing:true},
  {name:'settlement-only',hash:'matching',settlement:true},
  {name:'wrong-settlement-token',hash:'matching',settlement:true,wrongToken:true},
  {name:'live',hash:'matching',missing:true,live:true},
  {name:'changed-witness',hash:'old',reported:true},
 ] as const;
 for(const c of cases){
  const i=input(c.name),retainedInput=c.name==='legacy-missing-result'?{...i,state:{source:{text:'An older different question'},events:[],memory:[],claimMentions:[{id:'old-mention',text:'Historical fact'}]}}:i;
  const p=intent(c.name,retainedInput,{compatibilityHash:c.hash,leaseUntil:'live' in c?Date.now()+60000:0});
  await seed('semantic_intents',[p]);
  if(!('missing' in c)){
   const r=result(p,'failure' in c?{status:'DEFERRED',failure:c.failure,usage:{...usage,reported:c.reported}}:{});
   if('settlement' in c)await seed('semantic_settlements',[{...r,token:'wrongToken' in c?'foreign-owner':p.token}]);else await seed('semantic_results',[r]);
  }
  const baseline=await transaction(),paged=await transaction();
  if('live' in c){await expect(eagerReuse(baseline,i,'matching')).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});await expect(findSemanticReuse(paged,i,'matching')).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});continue}
  const expected=await eagerReuse(baseline,i,'matching');expect(await findSemanticReuse(paged,i,'matching')).toEqual(expected);
  expect([...paged.writes]).toEqual([...baseline.writes]);
  if(c.name==='changed-witness')expect(expected).toBeUndefined();
  else if(c.name==='wrong-settlement-token'||c.name==='legacy-missing-result'||c.name==='unknown')expect(expected?.failure).toBe('SEMANTIC_OUTCOME_UNKNOWN');
  else expect(expected?.id).toBe(c.name);
 }
 const orderInput=input('scan-order'),ordered=['order-z','order-a','order-m'].map(id=>intent(id,orderInput,{compatibilityHash:'matching'}));
 await seed('semantic_intents',ordered);await seed('semantic_results',ordered.map(p=>result(p)));
 const first=await eagerReuse(await transaction(),orderInput,'matching');expect(first).toBeDefined();
 expect(await findSemanticReuse(await transaction(),orderInput,'matching')).toEqual(first);
},30000);

it('transient pages honor staged and cached values including absence, and isolate returned objects',async()=>{
 const p=intent('cached',input());await seed('semantic_intents',[p]);await seed('semantic_results',[result(p)]);
 const tx=await transaction();await tx.read('semantic_results','cached');await tx.read('semantic_results','cached-absence');
 const staged=result(intent('staged',input()));await tx.write('semantic_results',staged.id,staged);
 await store.registerFeed({...feedFixture,id:'other-feed'});
 await seed('semantic_results',[{...result(intent('cached-absence',input())),feedId:'other-feed'}],'other-feed');
 const before=tx.metrics.preloadQueries;
 expect(await tx.transientReadSizes('semantic_results',['cached','cached-absence','staged'])).toEqual(new Map());
 const values=await tx.readTransientMany<SemanticOperationResult>('semantic_results',['cached','cached-absence','staged','cached']);
 expect(values.get('cached-absence')).toBeUndefined();expect(values.get('staged')).toEqual(staged);expect(tx.metrics.preloadQueries).toBe(before);
 values.get('cached')!.value={poison:true};values.get('staged')!.value={poison:true};
 const again=await tx.readTransientMany<SemanticOperationResult>('semantic_results',['cached','staged']);
 expect(again.get('cached')?.value).toEqual({answer:'cached'});expect(again.get('staged')?.value).toEqual({answer:'staged'});
 const fresh=result(intent('uncached',{...input(),state:{source:{text:'معلومة موثقة'}}}));await seed('semantic_results',[fresh]);
 const queries=tx.metrics.preloadQueries,sizes=await tx.transientReadSizes('semantic_results',['uncached','absent']);
 expect(sizes.get('uncached')).toBe(new TextEncoder().encode(JSON.stringify(fresh)).byteLength);
 const transient=await tx.readTransientMany<SemanticOperationResult>('semantic_results',['uncached','absent']);expect(transient.get('uncached')).toEqual(fresh);expect(transient.get('absent')).toBeUndefined();
 expect(tx.metrics.preloadQueries-queries).toBe(2);
 const reads=tx.metrics.documentReads;await tx.read('semantic_results','uncached');expect(tx.metrics.documentReads-reads).toBe(1);
},30000);

it('rejects foreign immutable identities and unsupported transient record kinds',async()=>{
 await store.registerFeed({...feedFixture,id:'other-feed'});await seed('semantic_results',[{id:'foreign',feedId:'other-feed'}],'other-feed');
 const tx=await transaction();await expect(tx.readTransientMany('semantic_results',['foreign'])).rejects.toMatchObject({code:'SCOPE_DENIED'});
 await expect(tx.readTransientMany('briefing_requests' as never,['missing'])).rejects.toMatchObject({code:'SCOPE_DENIED'});
 await expect(tx.readTransientMany('semantic_intents' as never,['missing'])).rejects.toMatchObject({code:'SCOPE_DENIED'});
},30000);

it('uses persisted intent ownership rather than a mutated transaction intent cache',async()=>{
 const i=input(),p=intent('persisted',i,{compatibilityHash:'matching'});await seed('semantic_intents',[p]);await seed('semantic_settlements',[{...result(p),token:p.token}]);
 const tx=await transaction(),cached=(await tx.read<SemanticIntent>('semantic_intents',p.id))!;cached.token='cache-poison';cached.compatibilityHash='other';
 expect(await findSemanticReuse(tx,i,'matching')).toMatchObject({id:'persisted',status:'SUCCEEDED',usage:{reported:true}});
},30000);

it('reduces each page for large immutable bodies while preserving a late exact answer',async()=>{
 const i=input(),intents=Array.from({length:5},(_,n)=>intent('large-'+n,{...i,state:{...(i.state as object),retainedGraph:'x'.repeat(n===4?1100000:550000)}},{compatibilityHash:n===4?'matching':'old-context'}));
 await seed('semantic_intents',intents);await seed('semantic_results',intents.map(p=>result(p)));
 const readMany=vi.spyOn(store,'readMany'),tx=await transaction(),winner=await findSemanticReuse(tx,i,'matching');expect(winner).toMatchObject({id:'large-4',status:'SUCCEEDED'});
 // The winning intent/result pair itself exceeds the page budget. It must
 // still be processed completely as one candidate, without dropping content.
 expect((winner?.input.state as {retainedGraph:string}).retainedGraph).toHaveLength(1100000);
 // Each intent plus its result exceeds 1 MiB. Two such pairs exceed the
 // planned 2 MiB payload budget, so they must never share one materialized page.
 expect(readMany.mock.calls.length).toBeGreaterThan(0);
 expect(readMany.mock.calls.every(([,kind,ids])=>kind!=='semantic_intents'||ids.length===1)).toBe(true);
 const reads=tx.metrics.documentReads;expect(await tx.read('semantic_results','large-0')).toMatchObject({id:'large-0'});expect(tx.metrics.documentReads-reads).toBe(1);
},30000);

it('rejects a foreign receipt beyond the first reusable answer as the eager scan did',async()=>{
 const i=input(),intents=Array.from({length:6},(_,n)=>intent('foreign-order-'+n,i,{compatibilityHash:'matching'}));
 await seed('semantic_intents',intents);await seed('semantic_results',[result(intents[0])]);
 await store.registerFeed({...feedFixture,id:'other-feed'});await seed('semantic_settlements',[{...result(intents[5]),feedId:'other-feed',token:intents[5].token}],'other-feed');
 await expect(eagerReuse(await transaction(),i,'matching')).rejects.toMatchObject({code:'SCOPE_DENIED'});
 await expect(findSemanticReuse(await transaction(),i,'matching')).rejects.toMatchObject({code:'SCOPE_DENIED'});
},30000);

it('preserves the eager negative snapshot if a reported result arrives after ownership preflight',async()=>{
 const i=input('late-arrival'),p=intent('late-arrival',i,{compatibilityHash:'matching'});await seed('semantic_intents',[p]);
 const tx=await transaction(),sizes=tx.transientReadSizes.bind(tx);
 vi.spyOn(tx,'transientReadSizes').mockImplementation(async(kind,ids)=>{
  const metadata=await sizes(kind,ids);
  if(kind==='semantic_settlements')await seed('semantic_results',[result(p)]);
  return metadata;
 });
 expect(await findSemanticReuse(tx,i,'matching')).toMatchObject({id:p.id,failure:'SEMANTIC_OUTCOME_UNKNOWN',usage:{reported:false}});
 expect(await store.read('feed-1','semantic_results',p.id)).toMatchObject({status:'SUCCEEDED',usage:{reported:true}});
},30000);

it('fails closed when a persisted intent JSON identity disagrees with its global key',async()=>{
 const i=input(),p=intent('embedded-id',i,{compatibilityHash:undefined});
 await ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind('semantic_intents','different-column-id','feed-1',JSON.stringify(p)).run();
 await expect(findSemanticReuse(await transaction(),i,'matching')).rejects.toMatchObject({code:'SCOPE_DENIED'});
},30000);

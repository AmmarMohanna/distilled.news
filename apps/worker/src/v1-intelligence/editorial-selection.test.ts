import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import fixture from './fixtures/staging-2000-oversized-input.json';
import {editorialPlannerState,fallbackEditorialPlan,OLD_RECAP_ORIGINAL,OLD_RECAP_RESTATED} from './editorial-plan';
import {cheapEditorialRanking,compareEditorialCandidates} from './editorial-ranking';
import {auditPlanReasoning} from './shortlist-audit';
import {DEFAULT_BRIEFING_BUDGET} from './scoring';
import {prepareSemanticShortlist,type ShortlistRecord,type ShortlistCandidate} from './shortlist';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,acceptEvidence} from './test-utils';
import {processEvidenceIntelligence} from './engine';
import {deterministicMatchers} from './matchers';
import {processV1Briefing} from './runtime';
import {readEditionDelivery,PUSH_DELIVERY_CONSUMER_IMPLEMENTED} from './delivery-status';
import {readScheduleAudit} from './schedule-audit';
import type {Env} from '../types';

const retained=(fixture as unknown as {shortlist:ShortlistRecord}).shortlist,budget=DEFAULT_BRIEFING_BUDGET;

describe('the planner is told what each signal measures',()=>{
 it('new calls restate OLD_RECAP as source age only; the original wording that ranked old below fresh stays reproducible for reserved calls',()=>{
  const legacy=editorialPlannerState(retained,budget,undefined,false),modern=editorialPlannerState(retained,budget,undefined,true);
  expect(legacy.instruction).toContain(OLD_RECAP_ORIGINAL);expect(OLD_RECAP_ORIGINAL).toContain('rank it below genuine window developments');
  expect(modern.instruction).not.toContain('rank it below genuine window developments');expect(modern.instruction).toContain(OLD_RECAP_RESTATED);
  for(const phrase of ['Judge these separately','Freshness never substitutes for informational value','only announce that a list, guide, video or analysis exists','Spare room never justifies a weak story','SEMANTIC_PENDING_BUDGET means','Never reuse one generic rationale'])expect(modern.instruction).toContain(phrase);
  expect(JSON.stringify(legacy.candidates)).not.toContain('readerState');
 });
});

describe('ranking and fallback ordering do not turn source age into importance',()=>{
 const candidate=(id:string,text:string,flags:string[],newFacts=1,extra:Partial<ShortlistCandidate>={}):ShortlistCandidate=>({targetType:'EVENT',targetVersionId:id,stableTargetId:'e-'+id,eventVersionIds:[id],evidenceRevisionIds:['r-'+id],facts:[{id:'f-'+id,text,evidenceRevisionIds:['r-'+id],claimMentionIds:[],selfContained:'YES'}],stateSlotIds:[],effects:[],flags,protectedReasons:[],correctionObligationIds:[],priority:.6,fallbackEditorial:{decision:'INCLUDE',newUnderstanding:newFacts?[{text,evidenceRevisionIds:['r-'+id]}]:[],previouslyCommunicated:[],treatment:'STANDARD',reasonCodes:['MATERIAL_NEW_FACT']} as any,...extra});
 const feed={title:'AI Industry Watch',interests:['AI companies and products'],geography:[] as string[]};
 it('an old but reader-new development keeps full freshness weight; only a development with nothing new is demoted',()=>{
  expect(cheapEditorialRanking(feed,candidate('a','Firmus scrapped its IPO.',['OLD_RECAP'])).freshness).toBe(1);
  expect(cheapEditorialRanking(feed,candidate('b','Firmus scrapped its IPO.',['OLD_RECAP'],0)).freshness).toBe(.2);
 });
 it('the deterministic fallback orders by informational ranking, not by source age',()=>{
  const old=candidate('old','Firmus scrapped its IPO after valuation concerns deepened.',['OLD_RECAP']),fresh=candidate('fresh','A list exists.',[]);
  old.ranking={...cheapEditorialRanking(feed,old),score:.9};fresh.ranking={...cheapEditorialRanking(feed,fresh),score:.5};
  const sl={candidates:[fresh,old],ledger:[],obligations:[]} as unknown as ShortlistRecord,plan=fallbackEditorialPlan(sl);
  expect(plan.stories.find(s=>s.targetVersionId==='old')!.order).toBeLessThan(plan.stories.find(s=>s.targetVersionId==='fresh')!.order);
  expect(compareEditorialCandidates(old,fresh)).toBeLessThan(0);
 });
});

describe('reasoning audit of a plan against the data it was given (the retained Oct 10 17:08 pattern)',()=>{
 it('flags generic reuse, a DIRECT fit called limited, and old source treated as reader-known; reports nothing for specific, supported reasons',()=>{
  const c=retained.candidates.filter(c=>!c.flags.includes('TITLE_EXTRACTION_PENDING')).slice(0,5);
  const generic='Lower relevance score and provisional; defer due to capacity and limited direct feed fit';
  const plan={stories:[
   ...c.slice(0,3).map(x=>({targetVersionId:x.targetVersionId,decision:'DEFER' as const,feedFit:'DIRECT',rationale:generic})),
   {targetVersionId:c[3].targetVersionId,decision:'DEFER' as const,feedFit:'CONTEXTUAL',rationale:'Old recap flagged; defer due to limited novelty and capacity constraints.'},
   {targetVersionId:c[4].targetVersionId,decision:'DEFER' as const,feedFit:'CONTEXTUAL',rationale:'Four candidates need about 4,000 input units each; only one fits the 8,000-unit allowance, and this ranks below the selected one.'}]};
  const defects=auditPlanReasoning(plan,retained).map(f=>f.defect);
  expect(defects.filter(d=>d==='GENERIC_RATIONALE_REUSED')).toHaveLength(3);expect(defects).toContain('FEED_FIT_CONTRADICTED_BY_RATIONALE');expect(defects).toContain('OLD_SOURCE_TREATED_AS_READER_KNOWN');
  expect(auditPlanReasoning({stories:[plan.stories[4]]},retained).filter(f=>f.targetVersionId===c[4].targetVersionId)).toEqual([]);
 });
});

describe('reader state and semantic scheduling are separate from evidence doubt',()=>{
 let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
 beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,title:'AI Industry Watch',interests:['AI companies'],geography:[]})});
 afterEach(async()=>ctx.dispose());
 const defer={...deterministicMatchers,event:{match:()=>({structuralRelation:'DEFER' as const,epistemicEffects:[],confidence:0,provenance:{scorer:'SEMANTIC' as const,policyVersion:'test',fallbackReason:'SEMANTIC_BUDGET_EXHAUSTED'}})}};
 it('an old, never-communicated development is UNSEEN; PROVISIONAL waiting for allowance carries SEMANTIC_PENDING_BUDGET, not a doubt flag',async()=>{
  await acceptEvidence(store,1,'Firmus said it made the decision due to market volatility.','publisher-1','2026-10-09T05:00:00Z','en','2026-10-09T04:06:00Z','Nvidia-backed data centre firm scraps IPO');
  await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),'2026-10-09T05:01:00Z',defer as any);
  const request=(await store.list<any>('feed-1','rematch_requests'))[0];
  await feedTransact(store,'feed-1',tx=>tx.write('rematch_attempts','wb',{id:'wb',feedId:'feed-1',requestId:request.id,attempt:1,state:'WAITING_BUDGET',reason:'SEMANTIC_BUDGET_EXHAUSTED',createdAt:'2026-10-10T15:29:00Z',nextAttemptAt:'2026-10-11T00:00:00Z'}));
  const sl=await prepareSemanticShortlist(store,'feed-1',{start:'2026-10-10T15:00:00Z',end:'2026-10-10T17:00:00Z',kind:'HOURLY'},'2026-10-10T17:00:00Z');
  const c=sl.candidates[0];
  expect(c.flags).toEqual(expect.arrayContaining(['OLD_RECAP','PROVISIONAL','SEMANTIC_PENDING_BUDGET']));expect(c.flags).not.toContain('IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE');expect(c.readerState).toBe('UNSEEN');
 },40000);
});

describe('publication versus actual reader delivery is reported step by step',()=>{
 let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,env:Env;
 beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,briefingFrequency:'HOURLY'});env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1'} as unknown as Env});
 afterEach(async()=>ctx.dispose());
 it('a published edition is persisted, verified, projected and readable, while push delivery is explicitly unimplemented and never "delivered"',async()=>{
  const {seedIntelligence}=await import('./test-utils');await seedIntelligence(store);
  const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const},edition=(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end))!;
  const status=await readEditionDelivery(store,'feed-1',edition.id);
  expect(status).toMatchObject({generated:true,persisted:true,ledgerProjected:true,publiclyReadable:true,withdrawn:false,push:{state:'NOT_IMPLEMENTED_OUTBOX_UNCONSUMED',jobState:'PENDING',attempts:0}});
  expect(status.push.state).not.toBe('DELIVERED');
  expect(await readScheduleAudit(ctx.db,'feed-1',new Date('2026-10-03T13:06:00Z'))).toMatchObject({state:'PUBLISHED',delivery:{push:{state:'NOT_IMPLEMENTED_OUTBOX_UNCONSUMED'}}});
 },40000);
 it('the claim "nothing consumes the delivery outbox" is checked against the source: a consumer must update this status model',()=>{
  expect(PUSH_DELIVERY_CONSUMER_IMPLEMENTED).toBe(false);
  const root=join(__dirname,'..'),files:string[]=[];const walk=(d:string)=>{for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory()){if(e.name!=='node_modules')walk(p)}else if(/\.ts$/.test(e.name)&&!/\.test\.ts$/.test(e.name))files.push(p)}};walk(root);
  const users=files.filter(f=>readFileSync(f,'utf8').includes('delivery_jobs')).map(f=>f.slice(root.length+1)).sort();
  expect(users).toEqual(['v1-intelligence/delivery-status.ts','v1-intelligence/publication.ts','v1-intelligence/store.ts']);
 });
});

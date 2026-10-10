import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {allocateFeasibleSelection,guaranteedStoryCount,storyCapacityBound,planningCapacity,type SelectionItem} from './planning-capacity';
import {DEFAULT_BRIEFING_BUDGET,scoreAndSelect,type BriefingBudget} from './scoring';
import {OLD_RECAP_ORIGINAL,OLD_RECAP_RESTATED} from './editorial-plan';
import {fallbackEditorialPlan,planCapacityFailures,prepareEditorialPlan,editorialPlannerState,EDITORIAL_PLAN_POLICY,type EditorialPlanBody} from './editorial-plan';
import {boundedEditorialInput} from './editorial-transport';
import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {compactEditorialInput} from './editorial-transport';
import {prepareSemanticShortlist,type ShortlistCandidate,type ShortlistRecord} from './shortlist';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {deferEditorialWork} from './editorial-work';
import {publishSelection} from './publication';
import {projectEditionLedger} from './ledger';
import hermes from './fixtures/overnight-hermes-plan.json';
import feedFit from './fixtures/overnight-feed-fit.json';
import midnight from './fixtures/staging-midnight-missing-required.json';
import evening from './fixtures/staging-2000-oversized-input.json';

const budget:BriefingBudget=DEFAULT_BRIEFING_BUDGET,cap=planningCapacity(budget).maxInputUnits;
const cost=(inputUnits:number)=>({inputUnits,evidenceCount:1,briefWords:40,standardWords:100,detailedWords:180});
const item=(id:string,inputUnits:number,value:number,extra:Partial<SelectionItem>={}):SelectionItem=>({id,cost:cost(inputUnits),treatment:'BRIEF',publisherIds:[id],protectedItem:false,order:Number(id.charCodeAt(0)),value,...extra});
const cand=(inputUnits:number,flags:string[]=[]):any=>({facts:[],evidenceRevisionIds:[],flags,communicationCost:cost(inputUnits)});

describe('candidate-specific feasibility replaces the worst-case cardinality estimate',()=>{
 // The illustrative table of the task: input allowance is the real 8,000 units (12,000 tokens minus the 4,000 reserve).
 const table=[['A',6800,.9],['B',2400,.9],['C',2000,.85],['D',1700,.6],['E',1000,.3]] as const;
 it('the real allowance is 8,000 units and the former most-expensive-first prefix allowed one story',()=>{
  expect(cap).toBe(8000);
  const former=(costs:number[])=>{let used=0,n=0;for(const c of [...costs].sort((a,b)=>b-a)){if(used+c>cap)break;used+=c;n++}return n};
  expect(former(table.map(r=>r[1]))).toBe(1);
  expect(storyCapacityBound(table.map(r=>cand(r[1])),budget)).toBe(4);
 });
 it('1. two high-value stories that fit are both selected although the former estimate allowed one',()=>{
  const r=allocateFeasibleSelection([item('A',5200,.9),item('B',2600,.9)],budget);
  expect([...r.accepted].sort()).toEqual(['A','B']);
 });
 it('2. three shorter important stories beat one expensive story, which is deferred with its real reason',()=>{
  const r=allocateFeasibleSelection(table.slice(0,4).map(([id,c,v],i)=>item(id,c,v,{order:i})),budget);
  expect([...r.accepted].sort()).toEqual(['B','C','D']);expect(r.rejected.get('A')).toBe('INPUT_CAPACITY');
 });
 it('2b. the whole table: A alone is not automatically better than B+C+D(+E); E is added only because the planner selected it',()=>{
  const r=allocateFeasibleSelection(table.map(([id,c,v],i)=>item(id,c,v,{order:i})),budget);
  expect([...r.accepted].sort()).toEqual(['B','C','D','E']);
  const withoutE=allocateFeasibleSelection(table.slice(0,4).map(([id,c,v],i)=>item(id,c,v,{order:i})),budget);expect(withoutE.accepted.has('E')).toBe(false);
 });
 it('A can still win when it is worth more than the cheaper combination',()=>{
  const r=allocateFeasibleSelection([item('A',6800,3),item('B',2400,.5),item('C',2000,.4),item('D',1700,.3)],budget);
  expect([...r.accepted]).toEqual(['A']);
 });
 it('3. only one story genuinely fits',()=>{
  expect(storyCapacityBound([cand(5000),cand(5000)],budget)).toBe(1);
  const r=allocateFeasibleSelection([item('A',5000,.9),item('B',5000,.8)],budget);expect([...r.accepted]).toEqual(['A']);expect(r.rejected.get('B')).toBe('INPUT_CAPACITY');
 });
 it('4. no story deserves publication: nothing is added, and blocked candidates never count toward capacity',()=>{
  expect(allocateFeasibleSelection([],budget).accepted.size).toBe(0);
  expect(storyCapacityBound([cand(1000,['TITLE_EXTRACTION_PENDING']),cand(1000,['IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE'])],budget)).toBe(0);
 });
 it('5. several feasible stories from one publisher still obey maxPerPublisher',()=>{
  const r=allocateFeasibleSelection([item('A',1500,.9,{publisherIds:['p']}),item('B',1500,.8,{publisherIds:['p']}),item('C',1500,.7,{publisherIds:['p']}),item('D',1500,.2,{publisherIds:['q']})],budget);
  expect([...r.accepted].sort()).toEqual(['A','B','D']);expect(r.rejected.get('C')).toBe('PUBLISHER_CAPACITY');
 });
 it('protected publisher exceptions agree across validation and allocation without bypassing hard limits',()=>{
  const items=[item('A',1000,.9,{publisherIds:['p'],protectedItem:true,order:0}),item('B',1000,.8,{publisherIds:['p'],protectedItem:true,order:1}),item('C',1000,.7,{publisherIds:['p'],protectedItem:true,order:2}),item('D',1000,.6,{publisherIds:['p'],order:3})];
  const r=allocateFeasibleSelection(items,budget);expect([...r.accepted]).toEqual(['A','B','C']);expect(r.rejected.get('D')).toBe('PUBLISHER_CAPACITY');
  const sl={candidates:items.map(i=>({targetVersionId:i.id,protectedReasons:i.protectedItem?['CORRECTION_OBLIGATION']:[],publisherIds:i.publisherIds,communicationCost:i.cost}))} as unknown as ShortlistRecord;
  const body={stories:items.map(i=>({targetVersionId:i.id,decision:'SELECT',treatment:i.treatment,order:i.order})),obligations:[]} as unknown as EditorialPlanBody;
  expect(planCapacityFailures(body,sl,budget)).toEqual([{targetVersionId:'D',reason:'PUBLISHER_CAPACITY'}]);
  expect(allocateFeasibleSelection(items,{...budget,maxStories:2}).rejected.get('C')).toBe('STORY_CAPACITY');
  expect(allocateFeasibleSelection(items,{...budget,maxInputTokens:5500}).rejected.get('B')).toBe('INPUT_CAPACITY');
  expect(allocateFeasibleSelection(items,{...budget,maxReadingWords:60}).rejected.get('B')).toBe('WORD_CAPACITY');
  expect(allocateFeasibleSelection(items,{...budget,maxEvidenceInspections:1}).rejected.get('B')).toBe('EVIDENCE_CAPACITY');
 });
 it('5b. a multi-publisher story is not refused merely because a publisher is not saturated',()=>{
  const r=allocateFeasibleSelection([item('A',1500,.9,{publisherIds:['p','q']}),item('B',1500,.8,{publisherIds:['q','r']})],budget);expect(r.accepted.size).toBe(2);
 });
 it('6. protected work is allocated first and never displaced by more valuable ordinary news',()=>{
  const r=allocateFeasibleSelection([item('a',6000,.1,{protectedItem:true,order:9}),item('B',2000,.99),item('C',2000,.98),item('D',2000,.97)],budget);
  expect(r.accepted.has('a')).toBe(true);expect([...r.accepted].length).toBe(2);expect(r.rejected.get('D')??r.rejected.get('C')).toBe('INPUT_CAPACITY');
 });
 it('every dimension is respected: stories, reading words, evidence inspections',()=>{
  const many=Array.from({length:8},(_,i)=>item(String.fromCharCode(65+i),500,.5,{order:i}));expect(allocateFeasibleSelection(many,budget).accepted.size).toBe(budget.maxStories);
  const wordy=allocateFeasibleSelection([item('A',500,.5,{cost:{...cost(500),standardWords:300},treatment:'STANDARD'}),item('B',500,.5,{cost:{...cost(500),standardWords:300},treatment:'STANDARD'})],budget);expect(wordy.accepted.size).toBe(1);expect([...wordy.rejected.values()]).toEqual(['WORD_CAPACITY']);
  const evid=allocateFeasibleSelection([item('A',500,.5,{cost:{...cost(500),evidenceCount:12}}),item('B',500,.5,{cost:{...cost(500),evidenceCount:12}})],budget);expect([...evid.rejected.values()]).toEqual(['EVIDENCE_CAPACITY']);
 });
 it('10. a long shortlist beyond the exhaustive limit degrades to planner order and protected work survives',()=>{
  const list=[item('z',1200,.1,{protectedItem:true,order:99}),...Array.from({length:30},(_,i)=>item(`s${i}`,1200,.5,{order:i,publisherIds:[`p${i}`]}))];
  const r=allocateFeasibleSelection(list,budget);expect(r.accepted.has('z')).toBe(true);expect(r.accepted.size).toBe(5);expect(r.accepted.has('s0')).toBe(true);
 });
 it('guaranteed count is achievable and never exceeds the sound upper bound',()=>{
  const list=table.map(r=>cand(r[1]));expect(guaranteedStoryCount(list,budget)).toBe(4);expect(guaranteedStoryCount(list,budget)).toBeLessThanOrEqual(storyCapacityBound(list,budget));
  expect(guaranteedStoryCount([cand(7000),cand(7000)],budget)).toBe(1);
 });
 it('plan feasibility check agrees with the allocator',()=>{
  const sl={candidates:table.map(([id,c])=>({targetVersionId:id,protectedReasons:[],publisherIds:[id],communicationCost:cost(c),facts:[],evidenceRevisionIds:[]}))} as unknown as ShortlistRecord;
  const story=(id:string,order:number)=>({targetVersionId:id,decision:'SELECT',treatment:'BRIEF',order}) as any;
  expect(planCapacityFailures({stories:[story('A',0),story('B',1)],obligations:[]} as EditorialPlanBody,sl,budget)).toEqual([{targetVersionId:'B',reason:'INPUT_CAPACITY'}]);
  expect(planCapacityFailures({stories:[story('B',0),story('C',1),story('D',2)],obligations:[]} as EditorialPlanBody,sl,budget)).toEqual([]);
 });
});

describe('end to end: planner, selection, writer-input admission and publication agree',()=>{
 let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
 const feed={...feedFixture,title:'AI Industry Watch',interests:['AI model releases, research, products, companies and industry developments'],geography:[]};
 beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feed)});
 afterEach(async()=>ctx.dispose());
 const first={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
 const texts=['Acme released an AI model with a longer context window.','The university opened a robotics laboratory for humanoid research.','Parliament passed a technology regulation covering model audits.'];
 const strongFor=(sl:ShortlistRecord,observe:(s:any)=>void)=>({model:'synthetic',usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async(_f:string,_p:string,state:any)=>{observe(state);return {value:compactEditorialInput(sl).encodeKeyed(fallbackEditorialPlan(sl)),usage:{calls:1,costUsd:.001,reported:true}}}});
 it('three distinct short stories are planned, selected, published and projected; distinct developments stay separate',async()=>{
  for(let i=0;i<3;i++)await seedIntelligence(store,i+1,texts[i],`publisher-${i}`);
  const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end);let observed:any;
  const plan=await prepareEditorialPlan(store,sl,budget,first.end,strongFor(sl,s=>{observed??=s}) as any);
  expect(observed.communicationCapacity.maxStories).toBe(3);expect(sl.candidates.every(c=>c.publisherIds?.length===1)).toBe(true);
  expect(plan.plannerSource).toBe('REAL_COMPARATIVE_MODEL');expect(plan.capacityAdjustments).toEqual([]);expect(plan.stories.filter(s=>s.decision==='SELECT')).toHaveLength(3);
  const selection=await scoreAndSelect(store,'feed-1',first,budget,first.end,undefined,plan);
  expect(selection.selectedCandidateIds).toHaveLength(3);expect(selection.omissions).toEqual([]);
  const facts=selection.selectedCandidateIds.map(id=>selection.editorialByCandidate![id].newUnderstanding.map(f=>f.text).join(' '));
  expect(new Set(facts).size).toBe(3);expect(facts.every(f=>texts.filter(t=>f.includes(t.replace(/\.$/,''))).length===1)).toBe(true);
  const edition=await publishSelection(store,'feed-1',selection.id,{now:()=>first.end});await projectEditionLedger(store,'feed-1',edition.id);
 },30000);
 it.each(['LEGACY','V1'] as const)('a planner result already billed under the %s input is reused: no second call, identical plan',async variant=>{
  for(let i=0;i<3;i++)await seedIntelligence(store,i+1,texts[i],`publisher-${i}`);
  const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end),feedRecord=await store.getFeed('feed-1'),legacy=editorialPlannerState(sl,budget,feedRecord,variant),modern=editorialPlannerState(sl,budget,feedRecord,'CURRENT');
  expect(legacy.communicationCapacity.maxStories).toBe(3);expect(legacy.instruction).not.toBe(modern.instruction);expect(legacy.instruction).not.toBe(modern.instruction);expect(legacy.candidates.some(c=>'readerState' in c)).toBe(false);expect(variant==='V1'?legacy.candidates.some(c=>'publisherIds' in c):!legacy.candidates.some(c=>'publisherIds' in c)).toBe(true);
  const input={feedId:'feed-1',feedRevision:sl.feedRevision,evidenceRevisionIds:sl.evidenceRevisionIds,kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:EDITORIAL_PLAN_POLICY,model:'synthetic',budgetKey:`editorial:${sl.window.start}:${sl.window.end}`,state:boundedEditorialInput(legacy).inputState},id=await sha256(canonicalJson(input));
  const value=fallbackEditorialPlan(sl);// billed results retain the decoded plan
  await feedTransact(store,'feed-1',tx=>tx.write('semantic_results',id,{id,feedId:'feed-1',input,status:'SUCCEEDED',value,usage:{calls:1,costUsd:.001,reported:true},latencyMs:1,createdAt:first.end}));
  let calls=0;const strong={model:'synthetic',usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async()=>{calls++;throw Error('must not be called')}};
  const plan=await prepareEditorialPlan(store,sl,budget,first.end,strong as any);
  expect(calls).toBe(0);expect(plan.operationId).toBe(id);expect(plan.plannerSource).toBe('REAL_COMPARATIVE_MODEL');expect(plan.stories.filter(s=>s.decision==='SELECT')).toHaveLength(3);
 },30000);
 it('selection refuses a plan that would exceed maxPerPublisher, even if the plan itself did not enforce it',async()=>{
  for(let i=0;i<3;i++)await seedIntelligence(store,i+1,texts[i],'publisher-same');
  const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end),plan=await prepareEditorialPlan(store,sl,{...budget,maxPerPublisher:20},first.end);
  expect(plan.stories.filter(s=>s.decision==='SELECT')).toHaveLength(3);
  const selection=await scoreAndSelect(store,'feed-1',first,budget,first.end,undefined,plan);
  expect(selection.selectedCandidateIds).toHaveLength(2);expect(selection.omissions.map(o=>o.reason)).toEqual(['SOURCE_DIVERSITY']);
 },30000);
 it('the planner stage itself defers the excess same-publisher story with its own capacity reason',async()=>{
  for(let i=0;i<3;i++)await seedIntelligence(store,i+1,texts[i],'publisher-same');
  const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end),plan=await prepareEditorialPlan(store,sl,budget,first.end);
  expect(plan.capacityAdjustments?.map(a=>a.reason)).toEqual(['PUBLISHER_CAPACITY']);
  const work=await store.list<any>('feed-1','editorial_deferred_work');expect(work.some(w=>w.reason==='PUBLISHER_CAPACITY'&&!w.expiresAt)).toBe(true);
 },30000);
 it('7. capacity-deferred important news is not retired by the seven-day calendar, while ordinary editorial deferral still is',async()=>{
  await seedIntelligence(store,1,texts[0],'publisher-0');await seedIntelligence(store,2,texts[1],'publisher-1');
  const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end),[a,b]=sl.candidates;
  await feedTransact(store,'feed-1',async tx=>{await deferEditorialWork(tx,a,'INPUT_CAPACITY',first.end,'o1');await deferEditorialWork(tx,b,'DEFERRED_EDITORIAL_WORK',first.end,'o2')});
  const stored=await store.list<any>('feed-1','editorial_deferred_work');
  expect(stored.find(w=>w.stableTargetId===a.stableTargetId).expiresAt).toBeUndefined();expect(stored.find(w=>w.stableTargetId===b.stableTargetId).expiresAt).toBeDefined();
  const later={start:'2026-10-11T12:00:00Z',end:'2026-10-11T13:00:00Z',kind:'HOURLY' as const};
  const next=await prepareSemanticShortlist(store,'feed-1',later,later.end);
  expect(next.candidates.map(c=>c.stableTargetId)).toContain(a.stableTargetId);expect(next.candidates.map(c=>c.stableTargetId)).not.toContain(b.stableTargetId);
 },30000);
 it('8. an unresolved-identity or extraction-pending candidate cannot be selected and is deferred as a technical blocker',async()=>{
  await seedIntelligence(store,1,texts[0],'publisher-0');
  const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end),blocked={...sl,candidates:sl.candidates.map(c=>({...c,flags:[...c.flags,'IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE']}))};
  const plan=await prepareEditorialPlan(store,blocked,budget,first.end);expect(plan.stories.every(s=>s.decision!=='SELECT')).toBe(true);
  expect((await store.list<any>('feed-1','editorial_deferred_work')).map(w=>w.reason)).toContain('BLOCKED_IDENTITY_OR_EXTRACTION');
 },30000);
});

describe('retained staging windows: what actually limited coverage',()=>{
 const find=(o:any):any[]=>{if(!o||typeof o!=='object')return [];if(Array.isArray(o.candidates)&&o.candidates[0]?.communicationCost)return o.candidates;for(const v of Object.values(o)){const found=find(v);if(found.length)return found}return []};
 const former=(list:any[])=>{let used=0,n=0;for(const c of list.map(c=>c.communicationCost.inputUnits).sort((a,b)=>b-a)){if(n>=budget.maxStories||used+c>cap)break;used+=c;n++}return n};
 it('overnight Hermes window: six selectable candidates; the former estimate allowed two but three genuinely fit',()=>{
  const list=find(hermes);expect(list).toHaveLength(6);
  expect(former(list)).toBe(2);expect(storyCapacityBound(list,budget)).toBeGreaterThanOrEqual(3);expect(guaranteedStoryCount(list,budget)).toBe(3);
  const inputs=list.map(c=>c.communicationCost.inputUnits).sort((a,b)=>a-b);expect(inputs[0]+inputs[1]+inputs[2]).toBeLessThanOrEqual(cap);expect(inputs[0]+inputs[1]+inputs[2]+inputs[3]).toBeGreaterThan(cap);
 });
 it('overnight feed-fit window: coverage was limited by title extraction/identity blockers, not by cardinality',()=>{
  const list=find(feedFit);expect(list).toHaveLength(7);
  const open=list.filter(c=>!c.flags.some((f:string)=>['TITLE_EXTRACTION_PENDING','IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE'].includes(f)));
  expect(open).toHaveLength(1);expect(storyCapacityBound(list,budget)).toBe(1);expect(former(list)).toBe(2);
 });

 it('midnight/20:00 windows: half the shortlist is blocked and no two remaining candidates fit together under the existing 8,000-unit allowance',()=>{
  for(const fixture of [midnight,evening]){
   const list=find(fixture),open=list.filter((c:any)=>!c.flags.some((f:string)=>['TITLE_EXTRACTION_PENDING','IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE'].includes(f)));
   expect(list.length).toBeGreaterThanOrEqual(16);expect(open.length).toBeLessThan(list.length);
   const costs=open.map((c:any)=>c.communicationCost.inputUnits).sort((a:number,b:number)=>a-b);
   expect(costs[0]+costs[1]).toBeGreaterThan(cap);expect(storyCapacityBound(list,budget)).toBe(1);expect(allocateFeasibleSelection(open.map((c:any,i:number)=>item(String(i),c.communicationCost.inputUnits,c.ranking.score,{order:i})),budget).accepted.size).toBe(1);
  }
 });
});

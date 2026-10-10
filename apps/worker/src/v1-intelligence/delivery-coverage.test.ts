import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import fixture from './fixtures/staging-2000-oversized-input.json';
import {auditShortlist,auditPlanReasoning} from './shortlist-audit';
import {fallbackEditorialPlan,validateEditorialPlan,editorialPlannerState,planCapacityFailures} from './editorial-plan';
import {allocateFeasibleSelection} from './planning-capacity';
import {DEFAULT_BRIEFING_BUDGET} from './scoring';
import {boundShortlist,prepareSemanticShortlist,type ShortlistRecord} from './shortlist';
import {partitionProvisionalMentions} from './composite-partition';
import {nextRematch,prioritizeRematches,protectedRematchRevisionIds,scheduleRematch,rematchExhausted,type RematchAttempt,type RematchRequest} from './rematch';
import {recordBlockedWindow,BLOCKED_REASON,PROTECTED_REASSESSMENT_POLICY} from './blocked-window';
import {deferEditorialWork,readUnreviewedOverflow} from './editorial-work';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence,acceptEvidence} from './test-utils';
import {processEvidenceIntelligence} from './engine';
import {deterministicMatchers} from './matchers';

const budget=DEFAULT_BRIEFING_BUDGET,retained=(fixture as unknown as {shortlist:ShortlistRecord}).shortlist;

describe('retained 20:00-Beirut (15:00-17:00Z) window: 21 candidates, one OPEN Anthropic withdrawal',()=>{
 const audit=auditShortlist(retained),by=(t:string)=>audit.find(a=>a.title.startsWith(t))!;
 it('every candidate is classified from evidence, not from a model rationale',()=>{
  expect(audit).toHaveLength(21);
  expect(by('Anthropic changes usage policy').causes).toEqual(['PROTECTED_CORRECTION_BLOCKED_BY_IDENTITY']);
  expect(by('Nous Research').causes).toEqual(['UNRESOLVED_HIGH_CONSEQUENCE_IDENTITY','EXTRACTION_PENDING']);
  expect(by('Cal AI').causes).toEqual(['UNRESOLVED_HIGH_CONSEQUENCE_IDENTITY']);
  expect(by('Meta rolls out').causes).toEqual(['EXTRACTION_PENDING','OLD_BUT_READER_NEW']);
  expect(by('White House blocks Microsoft').causes).toEqual(['WEAK_FEED_RELEVANCE']);
  for(const title of ['Fired OpenAI researchers say','Anthropic bans users','Nvidia-backed data centre','Fired OpenAI safety researchers'])expect(by(title)).toMatchObject({eligible:true,causes:['ELIGIBLE_SUPPORTED_NEW']});
  // No candidate is actual repetition: the ledger shows none of these facts as already communicated.
  expect(audit.some(a=>a.causes.includes('ACTUAL_REPETITION'))).toBe(false);
 });
 it('zero selections was not forced by any guard: the hard-guard-only baseline selects an eligible, supported story',()=>{
  const plan=fallbackEditorialPlan(retained);validateEditorialPlan(plan,retained);
  const selects=plan.stories.filter(s=>s.decision==='SELECT');
  expect(selects.length).toBeGreaterThan(0);
  for(const s of selects)expect(retained.candidates.find(c=>c.targetVersionId===s.targetVersionId)!.flags.some(f=>['TITLE_EXTRACTION_PENDING','IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE'].includes(f))).toBe(false);
 });
 it('capacity: only one of the eligible important stories fits under the existing 8,000-unit allowance, so capacity does not explain zero',()=>{
  const eligible=audit.filter(a=>a.eligible&&(a.relevance??0)>=.88).sort((a,b)=>(b.relevance??0)-(a.relevance??0));
  expect(eligible.map(a=>a.costUnits)).toEqual([4068,4460,4146,4330]);
  const items=eligible.map((a,i)=>({id:a.targetVersionId,cost:{inputUnits:a.costUnits!,evidenceCount:1,briefWords:40,standardWords:100,detailedWords:180},treatment:'BRIEF' as const,publisherIds:[a.targetVersionId],protectedItem:false,order:i,value:a.relevance!}));
  expect(allocateFeasibleSelection(items,budget).accepted.size).toBe(1);
  // Cheapest eligible pair misses by 214 units (2.7%); a hypothetical estimate tightened by 15% would admit pairs, never triples. This is not applied: the failure was zero selection.
  const sorted=eligible.map(a=>a.costUnits!).sort((a,b)=>a-b);expect(sorted[0]+sorted[1]-8000).toBe(214);
  const tight=sorted.map(c=>c*.85);expect(tight[0]+tight[1]).toBeLessThanOrEqual(8000);expect(tight[0]+tight[1]+tight[2]).toBeGreaterThan(8000);
 });
 it('reasoning audit flags causes the shortlist does not show, and does not flag causes it does',()=>{
  const find=(t:string)=>retained.candidates.find(c=>c.sourceTitles![0].startsWith(t))!;
  const firmus=find('Nvidia-backed'),cal=find('Cal AI'),researchers=find('Fired OpenAI researchers say');
  const plan={stories:[
   {targetVersionId:firmus.targetVersionId,decision:'DEFER' as const,rationale:'Identity unresolved and provisional, so defer.'},
   {targetVersionId:researchers.targetVersionId,decision:'SUPPRESS' as const,rationale:'Already communicated to the reader earlier.'},
   {targetVersionId:cal.targetVersionId,decision:'DEFER' as const,rationale:'Identity unresolved; the same event cannot be confirmed.'}]};
  const findings=auditPlanReasoning(plan,retained);
  expect(findings.filter(f=>f.targetVersionId===firmus.targetVersionId).map(f=>f.defect).sort()).toEqual(['IDENTITY_CLAIM_WITHOUT_FLAG','PROVISIONAL_USED_AS_BLOCKER']);
  expect(findings.filter(f=>f.targetVersionId===researchers.targetVersionId).map(f=>f.defect)).toEqual(['REPEAT_CLAIM_WITHOUT_LEDGER_MATCH']);
  expect(findings.filter(f=>f.targetVersionId===cal.targetVersionId)).toEqual([]);
 });
 it('planner guidance (new calls only) removes the observed reasoning traps; legacy input stays byte-identical',()=>{
  const modern=editorialPlannerState(retained,budget,undefined,true),legacy=editorialPlannerState(retained,budget,undefined,false);
  expect(modern.instruction.startsWith(legacy.instruction)).toBe(true);
  for(const phrase of ['PROVISIONAL alone is never a reason','prose Distilled withdrew','must name its real cause','never to reach the ceiling'.replace('never','Never')])expect(modern.instruction).toContain(phrase.replace('Never to','Never select a weak story to'));
  expect(legacy.instruction).not.toContain('PROVISIONAL alone');
 });
 it('fallback plan still blocks the OPEN correction target and reports it as a protected deferral, never as delivered',()=>{
  const plan=fallbackEditorialPlan(retained),anthropic=retained.candidates.find(c=>c.sourceTitles![0].startsWith('Anthropic changes'))!;
  const story=plan.stories.find(s=>s.targetVersionId===anthropic.targetVersionId)!;
  expect(story.decision).toBe('DEFER');expect(plan.obligations.every(o=>o.handling==='DEFER')).toBe(true);
  // The unconstrained fallback selects more than fits; hard allocation (not the model) trims it, protected first.
  expect(planCapacityFailures(plan,retained,budget).length).toBeGreaterThan(0);
 });
});

describe('zero, one and several stories are each appropriate',()=>{
 it('several: all eligible stories that fit are kept; one: the single fit; zero: planner may suppress everything',()=>{
  const plan=fallbackEditorialPlan(retained);
  const quiet={...plan,stories:plan.stories.map(s=>({...s,decision:(retained.candidates.find(c=>c.targetVersionId===s.targetVersionId)!.protectedReasons.length?'DEFER':'SUPPRESS') as 'DEFER'|'SUPPRESS',treatment:'OMIT' as const,deltaType:'UNRESOLVED' as const,mustIncludeFactIds:[]}))};
  // An explicit quiet window is valid only when the plan does not suppress protected corrections: the retained shortlist has an open one.
  expect(()=>validateEditorialPlan(quiet,retained,{requirePublicationCorrection:true})).not.toThrow();
 });
});

describe('correction reassessment is prioritized and bounded',()=>{
 const req=(id:string,rev:string):RematchRequest=>({id,feedId:'f',jobId:'j',evidenceRevisionId:rev,createdAt:'2026-10-09T00:00:00Z',policyVersion:'semantic-rematch-v1'});
 const att=(requestId:string,attempt:number,reason?:string,state:RematchAttempt['state']='DEFERRED',nextAttemptAt?:string):RematchAttempt=>({id:`${requestId}-${attempt}`,feedId:'f',requestId,attempt,state,reason,createdAt:`2026-10-09T0${attempt}:00:00Z`,nextAttemptAt});
 it('requests gating an open correction are dispatched first',()=>{
  const list=[req('a','r1'),req('b','r2'),req('c','r3')];
  expect(prioritizeRematches(list,new Set(['r3'])).map(r=>r.id)).toEqual(['c','a','b']);
 });
 it('a stale prepared judgment does not consume a semantic attempt, but total attempts stay bounded',()=>{
  const r=req('a','r1');
  const two=[att('a',1,'STALE_PREPARED_MEMORY'),att('a',2,'STALE_PREPARED_MEMORY')];
  expect(rematchExhausted(two)).toBe(false);expect(nextRematch(r,two,'2026-10-10T00:00:00Z')).toBe(3);
  const three=[...two,att('a',3,'STALE_PREPARED_MEMORY')];expect(rematchExhausted(three)).toBe(true);expect(nextRematch(r,three,'2026-10-10T00:00:00Z')).toBeUndefined();
  const real=[att('a',1,'SEMANTIC_IDENTITY_UNRESOLVED'),att('a',2,'SEMANTIC_IDENTITY_UNRESOLVED'),att('a',3,'SEMANTIC_IDENTITY_UNRESOLVED')];
  expect(nextRematch(r,real,'2026-10-10T00:00:00Z')).toBeUndefined();
  expect(nextRematch(r,[att('a',1,'SEMANTIC_IDENTITY_UNRESOLVED','DEFERRED','2026-10-11T00:00:00Z')],'2026-10-10T00:00:00Z')).toBeUndefined();
 });
});

describe('blocked windows, overflow retention and composite grouping',()=>{
 let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
 const feed={...feedFixture,title:'AI Industry Watch',interests:['AI model releases, research, products, companies and industry developments'],geography:[]};
 beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feed)});
 afterEach(async()=>ctx.dispose());
 const first={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
 it('an empty window with an identity-blocked protected correction is BLOCKED, not failed: no attempt is spent, reassessment is scheduled once, the obligation is untouched',async()=>{
  await seedIntelligence(store,1,'Acme released an AI model.');
  const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end),target=sl.candidates[0];
  const blockedCandidate={...target,flags:[...target.flags,'IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE'],protectedReasons:['CORRECTION_OBLIGATION'],correctionObligationIds:['ob-1']};
  const shortlist={...sl,candidates:[blockedCandidate]} as ShortlistRecord,selection={deferredProtectedTargetIds:[target.targetVersionId,'obligation:ob-1'],omissions:[]};
  const requestId='request-1';
  await feedTransact(store,'feed-1',tx=>tx.write('briefing_requests',requestId,{id:requestId,feedId:'feed-1',window:first,state:'PENDING',attempts:0,createdAt:first.end}));
  const one=await recordBlockedWindow(store,'feed-1',requestId,shortlist,selection,first.end);
  const request=await store.read<any>('feed-1','briefing_requests',requestId);
  expect(request).toMatchObject({state:'PENDING',attempts:0,reason:BLOCKED_REASON});expect(request.failure).toBeUndefined();
  expect(Date.parse(request.nextAttemptAt)).toBeGreaterThan(Date.parse(first.end));
  expect(one).toMatchObject({checks:1,obligationIds:['ob-1'],reassessment:{prospect:'NEW_REQUEST_SCHEDULED'}});expect(one!.targets[0].causes).toEqual(['IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE']);
  const scheduled=(await store.list<RematchRequest>('feed-1','rematch_requests')).filter(r=>r.policyVersion===PROTECTED_REASSESSMENT_POLICY);expect(scheduled).toHaveLength(1);
  const again=await recordBlockedWindow(store,'feed-1',requestId,shortlist,selection,'2026-10-03T13:10:00Z');
  expect(again).toMatchObject({checks:2,since:first.end,signature:one!.signature,reassessment:{prospect:'SCHEDULED'}});
  expect((await store.list('feed-1','rematch_requests')).filter((r:any)=>r.policyVersion===PROTECTED_REASSESSMENT_POLICY)).toHaveLength(1);
  expect((await store.read<any>('feed-1','briefing_requests',requestId)).attempts).toBe(0);
  // Once the bounded reassessment is exhausted there is no prospect: say so and recheck slowly instead of spinning.
  await feedTransact(store,'feed-1',tx=>tx.write('rematch_attempts','x',{id:'x',feedId:'feed-1',requestId:scheduled[0].id,attempt:1,state:'EXHAUSTED',createdAt:'2026-10-03T13:20:00Z'}));
  const none=await recordBlockedWindow(store,'feed-1',requestId,shortlist,selection,'2026-10-03T13:30:00Z');
  expect(none!.reassessment.prospect).toBe('NONE');expect(Date.parse((await store.read<any>('feed-1','briefing_requests',requestId)).nextAttemptAt)-Date.parse('2026-10-03T13:30:00Z')).toBeGreaterThanOrEqual(6*3600000);
  expect(await store.list('feed-1','correction_resolutions')).toEqual([]);
 },30000);
 it('protected rematch ordering follows the Events a correction obligation points at',async()=>{
  await seedIntelligence(store,1,'Acme released an AI model.');await seedIntelligence(store,2,'Beta released a robotics platform.','publisher-2');
  const events=await store.list<any>('feed-1','events'),revisions=await store.currentEvidence('feed-1');
  const memberships=await store.list<any>('feed-1','memberships'),target=events[0],member=memberships.find(m=>m.eventVersionId===target.currentVersionId);
  await feedTransact(store,'feed-1',async tx=>{await tx.write('ledger_entries','le-1',{id:'le-1',feedId:'feed-1',eventIds:[target.id],storylineIds:[],editionId:'ed',claimFacts:[],claimText:''});await tx.write('correction_obligations','ob-1',{id:'ob-1',feedId:'feed-1',ledgerEntryId:'le-1',editionId:'ed',kind:'RETRACTED',triggerId:'t',state:'OPEN',createdAt:first.end,policyVersion:'p'})});
  const ids=await protectedRematchRevisionIds(store,'feed-1');expect([...ids]).toEqual([member.evidenceRevisionId]);expect(revisions.length).toBe(2);
 },30000);
 it('never-reviewed overflow news survives the old seven-day expiry, gets guaranteed review slots, and is retired only after the retention bound',async()=>{
  await seedIntelligence(store,1,'Acme released an AI model.');
  const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end),c=sl.candidates[0];
  // A record created under the former rules: SHORTLIST_OVERFLOW with a seven-day expiry.
  await feedTransact(store,'feed-1',async tx=>{await deferEditorialWork(tx,c,'SHORTLIST_OVERFLOW',first.end,'old');});
  const work=(await store.list<any>('feed-1','editorial_deferred_work'))[0];expect(Date.parse(work.expiresAt)-Date.parse(first.end)).toBe(30*86400000);
  const legacy={...work,id:'legacy',expiresAt:new Date(Date.parse(first.end)+7*86400000).toISOString(),stableTargetId:'legacy-target'};void legacy;
  expect(await readUnreviewedOverflow(store,'feed-1','2026-10-20T00:00:00Z')).toMatchObject({atRisk:1,retiredUnreviewed:0,waiting:[{stableTargetId:c.stableTargetId,status:'AT_RISK'}]});
  const day8={start:'2026-10-11T12:00:00Z',end:'2026-10-11T13:00:00Z',kind:'HOURLY' as const};
  expect((await prepareSemanticShortlist(store,'feed-1',day8,day8.end)).candidates.map(x=>x.stableTargetId)).toContain(c.stableTargetId);
  const day31={start:'2026-11-03T12:00:00Z',end:'2026-11-03T13:00:00Z',kind:'HOURLY' as const};
  expect((await prepareSemanticShortlist(store,'feed-1',day31,day31.end)).candidates.map(x=>x.stableTargetId)).not.toContain(c.stableTargetId);
  expect(await store.list('feed-1','editorial_work_resolutions')).toEqual(expect.arrayContaining([expect.objectContaining({reason:'STALE_UNREVIEWED_AFTER_RETENTION'})]));
  expect(await readUnreviewedOverflow(store,'feed-1','2026-11-03T13:00:00Z')).toMatchObject({waiting:[],retiredUnreviewed:1});
 },60000);
 it('review slots: the best never-reviewed overflow candidates are admitted beyond the ordinary limit, bounded',()=>{
  const mk=(id:string,score:number,unreviewed=false)=>({targetVersionId:id,priority:score,protectedReasons:[] as string[],unreviewed,ranking:{score,relevance:score,freshness:1,semanticKey:id} as any});
  const list=[...Array.from({length:5},(_,i)=>mk(`n${i}`,.9-i*.01)),...Array.from({length:6},(_,i)=>mk(`u${i}`,.3-i*.01,true))];
  const r=boundShortlist(list,3);
  expect(r.selected.filter(c=>c.unreviewed)).toHaveLength(3);expect(r.selected).toHaveLength(6);expect(r.overflow.map(c=>c.targetVersionId)).toEqual(['n3','n4','u3','u4','u5']);
  expect(boundShortlist(list.filter(c=>!c.unreviewed),3).selected).toHaveLength(3);
 });
 describe('composite source: unrelated announcements bundled by one publisher',()=>{
  const title='Amazon details data-center transparency and opens consumer access for AI agents';
  const body='Amazon Web Services published a transparency report on the energy and water use of its data centers. Separately, Amazon said consumers can now let AI agents shop for them in the Alexa app.';
  const mention=(id:string,field:'title'|'body',text:string,from:string)=>({id,sourceText:text,span:{field,start:from.indexOf(text),end:from.indexOf(text)+text.length}});
  it('partitions on an explicit boundary with disjoint content; the bridging title becomes background',()=>{
   const s1='Amazon Web Services published a transparency report on the energy and water use of its data centers.',s2='Separately, Amazon said consumers can now let AI agents shop for them in the Alexa app.';
   const part=partitionProvisionalMentions([mention('t','title',title,title),mention('a','body',s1,body),mention('b','body',s2,body)])!;
   expect(part.groups).toEqual([['a'],['b']]);expect(part.backgroundMentionIds).toEqual(['t']);
  });
  it('does not split a coherent development, an unmarked article, or overlapping segments',()=>{
   const s1='Amazon Web Services published a transparency report on the energy and water use of its data centers.',s2='Meanwhile, the transparency report lists the energy and water use of Amazon data centers by region.',s3='Amazon said consumers can now let AI agents shop for them in the Alexa app.';
   expect(partitionProvisionalMentions([mention('a','body',s1,body),mention('c','body',s2,body)])).toBeUndefined();
   expect(partitionProvisionalMentions([mention('a','body',s1,body),mention('b','body',s3,body)])).toBeUndefined();
   expect(partitionProvisionalMentions([mention('a','body',s1,body)])).toBeUndefined();
  });
  it('end to end: a provisional (semantic DEFER) source yields two Events with exact separate support; the same source with a coherent body stays one Event',async()=>{
   const deferMatchers={...deterministicMatchers,event:{match:()=>({structuralRelation:'DEFER' as const,epistemicEffects:[],confidence:0,provenance:{scorer:'SEMANTIC' as const,policyVersion:'test',fallbackReason:'NO_ACCEPTED_JUDGMENT'}})}};
   await acceptEvidence(store,1,body,'publisher-1','2026-10-03T12:30:00Z','en','2026-10-03T12:00:00Z',title);
   await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),'2026-10-03T12:30:00Z',deferMatchers as any);
   const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end);
   const facts=sl.candidates.map(c=>c.facts.map(f=>f.text).sort());
   expect(sl.candidates).toHaveLength(2);
   expect(facts.some(f=>f.length===1&&f[0].includes('transparency report'))).toBe(true);expect(facts.some(f=>f.length===1&&f[0].includes('AI agents'))).toBe(true);
   expect(facts.flat().some(t=>t===title)).toBe(false);
   expect(await store.list('feed-1','rematch_requests')).not.toHaveLength(0);
   expect(sl.candidates.every(c=>c.flags.includes('PROVISIONAL'))).toBe(true);
  },30000);
 });
});

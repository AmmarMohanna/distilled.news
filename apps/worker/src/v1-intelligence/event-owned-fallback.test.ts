import {it,expect,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,acceptEvidence} from './test-utils';
import {extractClaimMentions} from './claims';
import {processEvidenceIntelligence} from './engine';
import {deterministicMatchers} from './matchers';
import {prepareSemanticShortlist,shortlistInTransaction} from './shortlist';
import * as scoring from './scoring';
const a='Lebanon approved a national electricity reform law.',b='Cedar University opened an independent clinical trial.';
it.each(['missing','empty','legacy'] as const)('Event-owned fallback never imports a sibling article fact: %s',async mode=>{
 const ctx=await createIntakeDatabase();try{await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await acceptEvidence(store,1,a+' '+b);
 const revision=(await store.currentEvidence('feed-1'))[0].revision,mentions=(await extractClaimMentions(revision)).mentions,provenance={scorer:'GPT' as const,policyVersion:'split-grounded-test'};
 await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),'2026-10-03T12:10:00Z',{...deterministicMatchers,construction:()=>({groups:mentions.map(m=>({claimMentionIds:[m.id],structuralRelation:'NEW_STORYLINE' as const,eventId:null,storylineId:null,epistemicEffects:[],entities:[],slots:[]})),backgroundMentionIds:[],provenance})});
 const states=await store.list<any>('feed-1','event_semantic_states'),props=await store.list<any>('feed-1','propositions'),first=states.find(s=>s.propositionIds.some((id:string)=>props.find(p=>p.id===id)?.text===a));expect(first).toBeDefined();
 if(mode==='missing')await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='propositions' AND id=?").bind(first.propositionIds[0]).run();
 if(mode==='empty'){await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='event_semantic_states' AND id=?").bind(first.id).run();await ctx.db.prepare("INSERT INTO v1_feed_documents VALUES('event_semantic_states',?,'feed-1',?)").bind(first.id,JSON.stringify({...first,propositionIds:[]})).run();}
 if(mode==='legacy')await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='event_semantic_states' AND id=?").bind(first.id).run();
 const scope=await prepareSemanticShortlist(store,'feed-1',{start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY'},'2026-10-03T13:00:00Z'),candidate=scope.candidates.find(c=>c.targetVersionId===first.eventVersionId);
 expect(candidate?.facts.some(f=>f.text===b)??false).toBe(false);
 expect(scope.candidates.some(c=>c.facts.some(f=>f.text===b))).toBe(true);
 if(mode==='legacy'){expect(candidate?.facts.map(f=>f.text)).toEqual([a]);}
 else{expect(candidate).toBeUndefined();expect((scope as any).unresolvedTargets).toEqual(expect.arrayContaining([expect.objectContaining({targetVersionId:first.eventVersionId,reason:'EVENT_FACT_OWNERSHIP_UNRESOLVED'})]));expect(await store.list('feed-1','editorial_processing_waits')).toEqual(expect.arrayContaining([expect.objectContaining({targetVersionId:first.eventVersionId,reason:'EVENT_FACT_OWNERSHIP_UNRESOLVED'})]));}
 }finally{await ctx.dispose()}
},30000);

it('a supported Storyline member cannot hide another member with unresolved ownership',async()=>{
 const ctx=await createIntakeDatabase();let restore=()=>{};
 try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await acceptEvidence(store,1,a+' '+b);
  const revision=(await store.currentEvidence('feed-1'))[0].revision,mentions=(await extractClaimMentions(revision)).mentions;
  await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),'2026-10-03T12:10:00Z',{...deterministicMatchers,construction:()=>({groups:mentions.map(m=>({claimMentionIds:[m.id],structuralRelation:'NEW_STORYLINE' as const,eventId:null,storylineId:null,epistemicEffects:[],entities:[],slots:[]})),backgroundMentionIds:[],provenance:{scorer:'GPT' as const,policyVersion:'split-grounded-test'}})});
  const states=await store.list<any>('feed-1','event_semantic_states'),props=await store.list<any>('feed-1','propositions'),missing=states.find(s=>s.propositionIds.some((id:string)=>props.find(p=>p.id===id)?.text===a));
  await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='event_semantic_states' AND id=?").bind(missing.id).run();
  // A retained legacy summary whose exact underlying proposition is unavailable.
  const version=await store.read<any>('feed-1','event_versions',missing.eventVersionId);
  await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='event_versions' AND id=?").bind(version.id).run();
  await ctx.db.prepare("INSERT INTO v1_feed_documents VALUES('event_versions',?,'feed-1',?)").bind(version.id,JSON.stringify({...version,state:'A historical development awaits supported detail.'})).run();
  const actualTargets=scoring.targets;
  const targetSpy=vi.spyOn(scoring,'targets').mockImplementation(async(...args)=>{
   const members=await actualTargets(...args);
   // Exercise the same multi-member boundary as a long-window Storyline without
   // inventing a canonical semantic relationship between independent Events.
   return [{...members[0],type:'STORYLINE',id:'read-only-group',stableId:'read-only-group',eventVersionIds:members.flatMap(t=>t.eventVersionIds)}];
  });
  restore=()=>targetSpy.mockRestore();
  const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
  const shortlist=await feedTransact(store,'feed-1',tx=>shortlistInTransaction(tx,window,window.end,undefined,{collectOnly:true}));
  expect(shortlist.candidates[0].facts.map(f=>f.text)).toEqual([b]);
  expect(shortlist.unresolvedTargets).toEqual(expect.arrayContaining([expect.objectContaining({targetVersionId:'read-only-group',eventVersionIds:expect.arrayContaining([missing.eventVersionId]),reason:'EVENT_FACT_OWNERSHIP_UNRESOLVED'})]));
 }finally{restore();await ctx.dispose()}
},30000);

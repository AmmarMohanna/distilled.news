import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {livePublicationWindow} from './schedule';
import {publishSelection,type SynthesisWriterInput} from './publication';
import type {BriefingCandidate} from '@distilled/contracts';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>ctx.dispose());
const end='2026-10-04T00:00:00Z';
const window=(durationMinutes:30|1440)=>livePublicationWindow({durationMinutes,timezone:'UTC'},new Date(end));
it('combines related developments over 24h but keeps short-window event focus and exact support',async()=>{
 await seedIntelligence(store,1,'Lebanon Parliament approved banking reform legislation.','committee','2026-10-03T23:40:00Z');
 await seedIntelligence(store,2,'Lebanon Parliament signed banking reform legislation.','parliament','2026-10-03T23:50:00Z');
 const short=await scoreAndSelect(store,'feed-1',window(30),DEFAULT_BRIEFING_BUDGET,end);
 const long=await scoreAndSelect(store,'feed-1',window(1440),DEFAULT_BRIEFING_BUDGET,end);
 expect(short.selectedCandidateIds).toHaveLength(1);expect(long.selectedCandidateIds).toHaveLength(1);
 expect((await store.read<BriefingCandidate>('feed-1','candidates',short.selectedCandidateIds[0]))?.targetType).toBe('EVENT');
 expect((await store.read<BriefingCandidate>('feed-1','candidates',long.selectedCandidateIds[0]))?.targetType).toBe('STORYLINE');
 expect(long.editorialByCandidate![long.selectedCandidateIds[0]]).toMatchObject({contextNeed:'HIGH',treatment:'DETAILED'});
 const edition=await publishSelection(store,'feed-1',long.id,{now:()=>end});
 expect(edition.stories).toHaveLength(1);expect(edition.eventVersionIds).toHaveLength(2);expect(edition.storylineVersionIds).toHaveLength(1);
 expect(edition.stories[0].claims.map(c=>c.text).join(' ')).toContain('approved');
 expect(edition.stories[0].claims.map(c=>c.text).join(' ')).toContain('signed');
},15000);
it('sends typed treatment and supported delta to synthesis and keeps maximum a ceiling',async()=>{
 await seedIntelligence(store);let input:SynthesisWriterInput|undefined;
 const selected=await scoreAndSelect(store,'feed-1',window(1440),{...DEFAULT_BRIEFING_BUDGET,maxStories:8},end);
 await publishSelection(store,'feed-1',selected.id,{now:()=>end,model:{model:'fixture',provider:'SYNTHETIC',maxCallCostUsd:.01,synthesize:async value=>{
  input=value;const story=value.stories[0],evidence=story.evidence[0],quote=evidence.body!;
  return {draft:{language:'en',stories:[{candidateId:story.candidate.id,claims:[{text:quote,support:[{evidenceRevisionId:evidence.id,quote}]}]}]},usage:{tokensIn:100,tokensOut:30,cost:.001,confirmed:true}};
 },verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),usage:{tokensIn:100,tokensOut:10,cost:.001,confirmed:true}})}});
 expect(input?.stories).toHaveLength(1);expect(input?.stories[0]).toHaveProperty('editorial.treatment','BRIEF');
 expect(input?.stories[0]).toHaveProperty('editorial.newUnderstanding.0.evidenceRevisionIds');
},15000);
it('suppresses only explicit low-information updates, retaining unknown semantic relevance',async()=>{
 await seedIntelligence(store,1,'Lebanon banking reform routine roundup: no substantive change.');
 await seedIntelligence(store,2,'Canada Parliament approved hockey stadium construction.','other');
 const selected=await scoreAndSelect(store,'feed-1',window(1440),DEFAULT_BRIEFING_BUDGET,end);
 expect(selected.selectedCandidateIds).toHaveLength(1);
 expect(selected.omissions.map(o=>o.reason)).toContain('LOW_INFORMATION_GAIN');
 expect(await store.list('feed-1','model_intents')).toHaveLength(0);
},15000);
it('does not suppress a material clause mixed with boilerplate or a relevant lexical nonmatch',async()=>{
 await seedIntelligence(store,1,'Lebanon banking reform routine roundup: no substantive change; the court annulled the law.');
 await seedIntelligence(store,2,'Beirut banks will refund depositors after capital controls are lifted.','bank');
 const selected=await scoreAndSelect(store,'feed-1',window(1440),DEFAULT_BRIEFING_BUDGET,end);
 expect(Object.values(selected.editorialByCandidate!).every(e=>e.decision==='INCLUDE')).toBe(true);
},15000);

import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection,type BriefingModelPort} from './publication';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>ctx.dispose());
const window={start:'2026-10-03T00:00:00Z',end:'2026-10-04T00:00:00Z',kind:'DAILY' as const};
async function conflicting() {
 await seedIntelligence(store,1,'Lebanon banking reform affected 20 depositors according to the government.','government');
 await seedIntelligence(store,2,'Lebanon banking reform affected more than 100 depositors according to the union. The discrepancy remains unresolved.','union');
 return scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,testPolicy.now());
}
it('preserves both attributed quantities and unresolved discrepancy in grounded extractive output',async()=>{
 const selected=await conflicting(),edition=await publishSelection(store,'feed-1',selected.id,{now:testPolicy.now});
 const text=edition.stories.flatMap(s=>s.claims).map(c=>c.text).join(' ');
 expect(text).toContain('20 depositors');expect(text).toContain('more than 100');expect(text).toContain('unresolved');
 expect(new Set(edition.stories.flatMap(s=>s.claims).flatMap(c=>c.support.map(s=>s.evidenceRevisionId))).size).toBe(2);
},15000);
it('rejects truthful one-sided model compression instead of manufacturing consensus by omission',async()=>{
 const selected=await conflicting();
 const model:BriefingModelPort={model:'fixture',provider:'SYNTHETIC',maxCallCostUsd:.01,synthesize:async input=>{
  const story=input.stories[0],e=story.evidence.find(e=>e.body!.includes('20 depositors'))!,quote=e.body!;
  return {draft:{language:'en',stories:[{candidateId:story.candidate.id,claims:[{text:quote,support:[{evidenceRevisionId:e.id,quote}]}]}]},usage:{tokensIn:100,tokensOut:30,cost:.001,confirmed:true}};
 },verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),usage:{tokensIn:100,tokensOut:10,cost:.001,confirmed:true}})};
 await expect(publishSelection(store,'feed-1',selected.id,{now:testPolicy.now,model})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(await store.list('feed-1','editions')).toHaveLength(0);
},15000);
it('does not let the reading ceiling discard one material side',async()=>{
 await seedIntelligence(store,1,'Lebanon banking reform affected 20 depositors according to the government, on the basis of the information in the report and with the information from the people in the report and the people at the bank.','government');
 await seedIntelligence(store,2,'Lebanon banking reform affected more than 100 depositors according to the union, on the basis of the information in the report and with the information from the people in the report and the people at the bank.','union');
 const narrow=await scoreAndSelect(store,'feed-1',window,{...DEFAULT_BRIEFING_BUDGET,maxReadingWords:60},testPolicy.now());
 expect(narrow.selectedCandidateIds).toHaveLength(1);
 await expect(publishSelection(store,'feed-1',narrow.id,{now:testPolicy.now})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(await store.list('feed-1','editions')).toHaveLength(0);
},15000);
it('accepts verified concise paraphrases preserving every material side with exact supporting evidence',async()=>{
 const selected=await conflicting();
 const edition=await publishSelection(store,'feed-1',selected.id,{now:testPolicy.now,model:{model:'fixture',provider:'SYNTHETIC',maxCallCostUsd:.01,synthesize:async input=>{
  const story=input.stories[0];return {draft:{language:'en',stories:[{candidateId:story.candidate.id,claims:[{text:'The government counted 20 affected depositors; the union reported over 100, with the discrepancy unresolved.',support:story.evidence.map(e=>({evidenceRevisionId:e.id,quote:e.body!}))}]}]},usage:{tokensIn:100,tokensOut:30,cost:.001,confirmed:true}};
 },verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>c.requiredFacts??[]).map(f=>f.id),usage:{tokensIn:100,tokensOut:20,cost:.001,confirmed:true}})}});
 expect(edition.stories[0].claims[0].text).toContain('over 100');expect(edition.stories[0].claims[0].support).toHaveLength(2);
},15000);
it('rejects loss of a material uncertainty qualifier even with a valid supporting quote',async()=>{
 const body='Lebanon banking reform may affect 100 depositors; the final number remains uncertain.';
 await seedIntelligence(store,1,body);const selected=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,testPolicy.now());
 await expect(publishSelection(store,'feed-1',selected.id,{now:testPolicy.now,model:{model:'fixture',provider:'SYNTHETIC',maxCallCostUsd:.01,synthesize:async input=>{
  const story=input.stories[0],e=story.evidence[0];return {draft:{language:'en',stories:[{candidateId:story.candidate.id,claims:[{text:'Lebanon banking reform affects 100 depositors.',support:[{evidenceRevisionId:e.id,quote:body}]}]}]},usage:{tokensIn:100,tokensOut:20,cost:.001,confirmed:true}};
 },verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),usage:{tokensIn:100,tokensOut:10,cost:.001,confirmed:true}})}})).rejects.toMatchObject({code:'INVALID_REQUEST'});
},15000);
it('retains a negated outcome split into a separate sentence',async()=>{
 const body='Lebanon Parliament debated banking reform. The law was not approved.';
 await seedIntelligence(store,1,body);const selected=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,testPolicy.now());
 await expect(publishSelection(store,'feed-1',selected.id,{now:testPolicy.now,model:{model:'fixture',provider:'SYNTHETIC',maxCallCostUsd:.01,synthesize:async input=>{
  const story=input.stories[0],e=story.evidence[0];return {draft:{language:'en',stories:[{candidateId:story.candidate.id,claims:[{text:body.split('. ')[0]+'.',support:[{evidenceRevisionId:e.id,quote:body}]}]}]},usage:{tokensIn:100,tokensOut:20,cost:.001,confirmed:true}};
 },verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),usage:{tokensIn:100,tokensOut:10,cost:.001,confirmed:true}})}})).rejects.toMatchObject({code:'INVALID_REQUEST'});
},15000);
it('cannot reuse a collective preservation verdict after dropping the opposing claim for budget',async()=>{
 await conflicting();const selected=await scoreAndSelect(store,'feed-1',window,{...DEFAULT_BRIEFING_BUDGET,maxReadingWords:40},testPolicy.now());
 expect(selected.selectedCandidateIds).toHaveLength(1);
 await expect(publishSelection(store,'feed-1',selected.id,{now:testPolicy.now,model:{model:'fixture',provider:'SYNTHETIC',maxCallCostUsd:.01,synthesize:async input=>{
  const story=input.stories[0],support=story.evidence.map(e=>({evidenceRevisionId:e.id,quote:e.body!}));
  return {draft:{language:'en',stories:[{candidateId:story.candidate.id,claims:[{text:'The government counted 20 affected depositors.',support},{text:Array.from({length:4},()=> 'The union reported over 100 affected depositors and the discrepancy remains unresolved.').join(' '),support}]}]},usage:{tokensIn:100,tokensOut:100,cost:.001,confirmed:true}};
 },verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>c.requiredFacts??[]).map(f=>f.id),usage:{tokensIn:100,tokensOut:20,cost:.001,confirmed:true}})}})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(await store.list('feed-1','editions')).toHaveLength(0);
},15000);
it.each([['two','three'],['all','some']])('preserves disagreeing quantities expressed as words: %s vs %s',async(first,second)=>{
 await seedIntelligence(store,1,`Lebanon banking reform affected ${first} depositors according to the government.`,'government');
 await seedIntelligence(store,2,`Lebanon banking reform affected ${second} depositors according to the union.`,'union');
 const selected=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,testPolicy.now());
 await expect(publishSelection(store,'feed-1',selected.id,{now:testPolicy.now,model:{model:'fixture',provider:'SYNTHETIC',maxCallCostUsd:.01,synthesize:async input=>{
  const story=input.stories[0],e=story.evidence.find(e=>e.body!.includes(`${first} depositors`))!;return {draft:{language:'en',stories:[{candidateId:story.candidate.id,claims:[{text:e.body!,support:[{evidenceRevisionId:e.id,quote:e.body!}]}]}]},usage:{tokensIn:100,tokensOut:20,cost:.001,confirmed:true}};
 },verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),usage:{tokensIn:100,tokensOut:10,cost:.001,confirmed:true}})}})).rejects.toMatchObject({code:'INVALID_REQUEST'});
},15000);

import {beforeEach,afterEach,it,expect} from 'vitest';
import fixture from './fixtures/staging-temporal-framing.json';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan} from './editorial-plan';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection,type BriefingModelPort} from './publication';
const window={...fixture.window,kind:'30M' as const};
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store,1,fixture.fact.text,'publisher-1',new Date(Date.parse(window.end)-1000).toISOString(),'en',fixture.sourcePublishedAt)});
afterEach(async()=>ctx?.dispose());
it.each([false,true])('old first-edition reporting only publishes with verified temporal framing (%s)',async framed=>{
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end);
 expect(shortlist.candidates[0].facts[0].timing?.framingRequired).toBe(true);
 const selected=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan),usage={tokensIn:100,tokensOut:40,cost:.001,confirmed:true};
 const model:BriefingModelPort={model:'controlled',provider:'TEST',maxCallCostUsd:.01,synthesize:async input=>{
  expect(input.window).toEqual(window);const s=input.stories[0],f=s.approvedFacts![0];expect(f.timing?.sourcePublishedAt).toBe(fixture.sourcePublishedAt);expect(f.timing?.eventTime).toBeUndefined();
  return {draft:{language:'en',stories:[{candidateId:s.candidate.id,claims:[{text:framed?'An October 2 report shows a police officer finding a gun in Mangione?s backpack, days after the killing of UnitedHealthcare CEO Brian Thompson.':fixture.badClaim,support:f.support}]}]},usage};
 },verify:async claims=>{
  const required=claims.flatMap(c=>c.requiredFacts??[]);expect(required[0].timing?.framingRequired).toBe(true);
  return {supportedClaimIds:claims.map(c=>c.id),preservedFactIds:framed?required.map(f=>f.id):[],novelFactIds:required.map(f=>f.id),semanticChecks:required.map(f=>({factId:f.id,communicated:true,attribution:true,certainty:true,temporal:framed,qualifiers:true,reason:framed?'Reporting age explicit; event date unknown.':'Older reporting presented as fresh.',readerSpans:[{claimId:claims[0].id,text:claims[0].text}]})),usage};
 }};
 if(!framed){await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model})).rejects.toMatchObject({code:'INVALID_REQUEST'});expect(await store.list('feed-1','editions')).toHaveLength(0)}
 else {const edition=await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model});expect(edition.stories[0].claims[0].text).toContain('October 2 report');expect(await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model})).toEqual(edition);expect(await store.list('feed-1','editions')).toHaveLength(1)}
},30000);

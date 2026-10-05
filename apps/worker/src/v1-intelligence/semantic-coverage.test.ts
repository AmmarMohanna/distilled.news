import {it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan} from './editorial-plan';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection,type BriefingModelPort} from './publication';
const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
const faithful={communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Reader prose communicates the complete approved meaning with no added proposition.'};
async function run(source:string,text:string,facet?:keyof typeof faithful){
 const ctx=await createIntakeDatabase();
 try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store,1,source);
  const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end),selected=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan),usage={tokensIn:100,tokensOut:50,cost:.001,confirmed:true};let calls=0;
  const model:BriefingModelPort={model:'controlled-semantic-verifier',provider:'TEST',maxCallCostUsd:.01,synthesize:async input=>{const s=input.stories[0];return {draft:{language:'en',stories:[{candidateId:s.candidate.id,claims:[{text,support:s.approvedSpans!,communicatedFactIds:s.approvedFacts!.map(f=>f.id)}]}]},usage};},verify:async claims=>{calls++;const facts=claims.flatMap(c=>c.requiredFacts??[]);return {supportedClaimIds:facet?[]:claims.map(c=>c.id),preservedFactIds:facts.map(f=>f.id),semanticChecks:facts.map(f=>({factId:f.id,...faithful,...(facet?{[facet]:false,reason:'The generated meaning changes or omits the approved proposition.'}:{})})),novelFactIds:claims.flatMap(c=>(c.newUnderstandingFacts??[]).map(f=>f.id)),usage};}};
  if(facet){await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model})).rejects.toMatchObject({code:'INVALID_REQUEST'});expect(await store.list('feed-1','editions')).toHaveLength(0);}
  else{const edition=await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model});expect(edition.stories[0].claims[0].text).toBe(text);expect(calls).toBe(1);for(const ref of edition.stories[0].claims[0].support)expect((await store.revision('feed-1',ref.evidenceRevisionId))!.body).toContain(ref.quote);expect(await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model})).toEqual(edition);expect(calls).toBe(1);}
 }finally{await ctx.dispose();}
}
it.each([
 ['NASA launched Mission X on Monday. Mission X will study solar activity.','NASA launched Mission X on Monday for a mission studying solar activity.'],
 ['The death toll rose to 40.','Forty people have now died.'],
 ['The minister resigned.','The minister stepped down.'],
 ['The company expects revenue to fall.','The company said it anticipates lower revenue.'],
 ['Officials said the mission is scheduled to launch Monday.','According to officials, launch is planned for Monday.'],
 ['NASA launched Mission X on Monday. Mission X will study solar activity.','To study solar activity, Mission X was launched by NASA on Monday.'],
 ['NASA said “Launch is planned for Monday.”','NASA said “Launch is planned for Monday.”']
])('accepts independently verified semantic paraphrase, combination or restructuring: %s',async(source,text)=>run(source,text),25000);
it.each([
 ['NASA said the launch may occur Monday.','The launch will occur Monday.','certainty'],
 ['The launch is expected Monday.','The launch happened Monday.','temporal'],
 ['The minister allegedly resigned.','The minister definitely resigned.','certainty'],
 ['NASA said the mission launched Monday.','The mission launched Monday.','attribution'],
 ['Officials reported at least 40 deaths.','Forty people died.','qualifiers'],
 ['The minister resigned.','The minister resigned after a corruption scandal.','communicated'],
 ['The minister resigned.','A government official left office.','communicated'],
 ['NASA launched Mission X on Monday. Mission X will study solar activity.','NASA launched Mission X on Monday.','communicated'],
 ['If you were living on the station for six months, what would you bring?','The crew will live on the station for six months.','temporal']
] as const)('rejects semantic drift even when fact IDs claim coverage: %s',async(source,text,facet)=>run(source,text,facet),25000);

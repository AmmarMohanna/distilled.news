import {it,expect} from 'vitest';
import {extractClaimMentions,isNewsMention} from './claims';
import {approvedWriterFacts,approvedSupportSpans,type SynthesisInput} from './publication';
const revision={id:'revision',feedId:'feed',contentHash:'hash',acceptedAt:'2026-10-08T07:00:00Z',body:'The company plans to showcase devices in August.'} as any;
it.each(['Mistral releases a new 1T model.','Microsoft and Nvidia unveil a new AI PC.'])('factual title is a first-class exact provenance span: %s',async title=>{
 const {mentions}=await extractClaimMentions({...revision,title});expect(mentions.some(m=>m.span.field==='title'&&m.sourceText===title&&isNewsMention(m))).toBe(true);expect(mentions.some(m=>m.span.field==='body')).toBe(true);
});
it.each(['What is a supercomputer for?','Join us at Disrupt and save $100'])('non-news title stays evidence without becoming a proposition: %s',async title=>{
 const {mentions}=await extractClaimMentions({...revision,title});expect(mentions.filter(m=>m.span.field==='title').some(isNewsMention)).toBe(false);expect(mentions.filter(m=>m.span.field==='body').some(isNewsMention)).toBe(true);
});
it('a title-derived approved fact can reach writer and grounding as exact source support',()=>{
 const text='Mistral releases a new 1T model.';
 const story={candidate:{id:'candidate'},evidence:[{...revision,title:text}],plan:{facts:[{id:'fact',text,evidenceRevisionIds:['revision']}],newUnderstandingFactIds:['fact'],mustIncludeFactIds:['fact'],contextFactIds:[],attributionFactIds:[],certaintyFactIds:[],disagreementFactIds:[],openQuestionFactIds:[]}} as unknown as SynthesisInput['stories'][number];
 expect(approvedWriterFacts(story)[0].support).toContainEqual({evidenceRevisionId:'revision',quote:text});expect(approvedSupportSpans(story)).toContainEqual({evidenceRevisionId:'revision',quote:text});
});

it('a factual headline survives retained evidence -> ClaimMention -> Proposition -> shortlist -> plan -> edition with original title provenance',async()=>{
 const {createIntakeDatabase,seedIntakeScope}=await import('../v1-intake/test-utils'),{V1IntakeStore}=await import('../v1-intake/store'),{V1FeedStore}=await import('./store'),{acceptEvidence,feedFixture}=await import('./test-utils'),{processEvidenceIntelligence}=await import('./engine'),{prepareSemanticShortlist}=await import('./shortlist'),{prepareEditorialPlan}=await import('./editorial-plan'),{scoreAndSelect,DEFAULT_BRIEFING_BUDGET}=await import('./scoring'),{publishSelection}=await import('./publication');
 const ctx=await createIntakeDatabase();try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);
  const title='Samsung profits reach $80 billion amid an AI chip boom.';
  await acceptEvidence(store,1,'Samsung plans to showcase folding devices in August.','publisher-1','2026-10-03T12:30:00Z','en','2026-10-03T12:20:00Z',title);await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),'2026-10-03T12:30:00Z');
  const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const},scope=await prepareSemanticShortlist(store,'feed-1',window,window.end),fact=scope.candidates.flatMap(c=>c.facts).find(f=>f.text===title)!;
  expect(fact).toBeDefined();const mention=await store.read<any>('feed-1','claim_mentions',fact.claimMentionIds[0]);expect(mention.span.field).toBe('title');
  const plan=await prepareEditorialPlan(store,scope,DEFAULT_BRIEFING_BUDGET,window.end),selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan),edition=await publishSelection(store,'feed-1',selection.id,{now:()=>window.end});
  expect(edition.stories.flatMap(s=>s.claims).some(c=>c.text.includes('$80 billion')&&c.support.some(s=>s.quote.includes('$80 billion')))).toBe(true);
 }finally{await ctx.dispose()}
},25000);

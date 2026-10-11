import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {nonFactRole,isNewsMention} from './claims';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,acceptEvidence} from './test-utils';
import {processEvidenceIntelligence} from './engine';
import {prepareSemanticShortlist} from './shortlist';

describe('information sufficiency is decided by what a sentence does, not by its length',()=>{
 it.each([
  ['Here are the top AI agents that can live in your text messages','TEASER'],// retained Oct 10 title
  ['We created a list of the most notable AI agents that can live in your text messages, from general assistants to agents designed for families, travel, and work.','TEASER'],// retained Oct 10 body
  ['Here\'s a guide to the best budget phones','TEASER'],['Here are 7 apps worth installing','TEASER'],['We compiled a roundup of this week\'s funding rounds.','TEASER'],
  ['10 best laptops for students','TEASER'],['In this episode, we talk to the founder.','TEASER'],['Everything you need to know about the merger','TEASER'],['Read on for the full ranking.','TEASER'],
  ['5 days to TechCrunch Disrupt 2026: Don’t pay more at the door for your pass','PROMOTION'],['3 days to TechCrunch Disrupt 2026: Meet the startups before they hit mainstream','PROMOTION'],
  ['TechCrunch Disrupt 2026 starts in 4 days — lock in your pass savings of up to $100 before prices rise.','PROMOTION'],
  ['Hear from Ambrosia Energy and Bloom Energy execs on where the AI infrastructure boom is headed at TechCrunch Disrupt.','PROMOTION'],
  ['OpenAI’s Alexander Embiricos is coming to the AI Stage at TechCrunch Disrupt 2026.','PROMOTION'],['Use code SAVE20 for 20% off.','PROMOTION'],
 ])('teaser or promotion: %s',(text,role)=>expect(nonFactRole(text)).toBe(role));
 it.each([
  'Firmus scrapped its IPO.','OpenAI released GPT-6.','Anthropic updated its usage policy to ban repeated extreme abuse of Claude.','Nvidia-backed data centre firm scraps IPO as AI valuation concerns deepen',
  'Top EU court rules Meta must change its ad model.','Best Buy cut 500 jobs, the company said.','The Fed raised rates by 25 basis points.','Three fired OpenAI safety researchers dispute allegations of mishandling sensitive information.',
  'Here\'s what the court decided: it struck down the 2019 law on appeal and ordered a retrial.','Everything changed on Tuesday when the central bank devalued the currency.',
  'We created 4,000 jobs in the first year, the company said.','Our team found the vulnerability affects 2 million devices.','Amazon Web Services published a transparency report on the energy and water use of its data centers.',
  'TechCrunch reported on October 8 that OpenAI’s revenue is reportedly $20 billion less than previously projected.','Lebanon’s parliament approved the banking reform law.',
 ])('short or long, substantive statements are kept for editorial judgment: %s',text=>{expect(nonFactRole(text)).toBeUndefined();expect(isNewsMention({reportingRole:'OTHER_UNCERTAIN',sourceText:text})).toBe(true)});
 it('analysis with a stated conclusion is not a teaser even when it is an explainer',()=>{
  for(const text of ['A new study finds that remote workers are 13% more productive.','The report concludes that three of the five largest banks would fail a severe stress test.'])expect(nonFactRole(text)).toBeUndefined();
 });
});

describe('end to end: an empty teaser creates no editorial candidate, a short announcement still does',()=>{
 let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
 const feed={...feedFixture,title:'AI Industry Watch',interests:['AI products, companies and research'],geography:[]};
 const window={start:'2026-10-10T15:00:00Z',end:'2026-10-10T17:00:00Z',kind:'HOURLY' as const};
 beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feed)});
 afterEach(async()=>ctx.dispose());
 it('the retained listicle (title plus one teaser sentence) yields zero facts and is not a candidate; "Firmus scraps IPO" (also short) is',async()=>{
  await acceptEvidence(store,1,'We created a list of the most notable AI agents that can live in your text messages, from general assistants to agents designed for families, travel, and work.','publisher-1','2026-10-10T15:08:57Z','en','2026-10-10T14:00:00Z','Here are the top AI agents that can live in your text messages');
  await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),'2026-10-10T15:09:00Z');
  await acceptEvidence(store,2,'Firmus said it made the decision due to recent market volatility.','publisher-2','2026-10-10T15:30:00Z','en','2026-10-10T15:20:00Z','Nvidia-backed data centre firm scraps IPO');
  await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-2','']),'2026-10-10T15:31:00Z');
  const sl=await prepareSemanticShortlist(store,'feed-1',window,'2026-10-10T17:00:00Z'),titles=sl.candidates.map(c=>c.sourceTitles?.[0]);
  expect(titles).toEqual(['Nvidia-backed data centre firm scraps IPO']);
  expect(sl.candidates[0].facts.map(f=>f.text)).toEqual(expect.arrayContaining(['Nvidia-backed data centre firm scraps IPO']));
 },40000);
});

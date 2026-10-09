import {it,expect} from 'vitest';
import observed from './fixtures/overnight-mixed-verifier.json';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan,fallbackEditorialPlan} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection,QuietPublication,type BriefingModelPort} from './publication';
it('the actual overnight verifier accepted OpenAI and rejected Hermes against a same-story witness',()=>{
 const checks=observed.verification[0].semanticChecks;
 expect(checks.some(c=>c.readerNovelty?.status==='NEW')).toBe(true);
 expect(checks.some(c=>c.readerNovelty?.status==='ALREADY_COMMUNICATED'&&c.readerNovelty.previousFactTexts.length>0)).toBe(true);
});
it.each([[false,false],[false,true],[true,false]])('settled repeated stories are removed, preserving independently NEW stories (all repeated=%s, false correction=%s)',async (allRepeated,falseCorrection)=>{
 const ctx=await createIntakeDatabase();try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);
  await seedIntelligence(store,1,'OpenAI introduced an interactive visual interface.');
  await seedIntelligence(store,2,'Hermes developer raised $90 million.');
  const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
  const scope=await prepareSemanticShortlist(store,'feed-1',window,window.end);
  scope.id+=':mixed';
  for(const c of scope.candidates){const text=c.facts[0].text;scope.ledger.push({id:'history-'+c.targetVersionId,claimText:text,claimFacts:[text.includes('Hermes')?'Hermes developer has raised $90 million.':'OpenAI has introduced an interactive visual interface.'],eventIds:[c.stableTargetId],storylineIds:[],certainty:{kind:'UNSPECIFIED',hedges:[]},editionId:'prior'});}
  await feedTransact(store,'feed-1',tx=>tx.write('shortlists',scope.id,scope));
  const body=fallbackEditorialPlan(scope);for(const s of body.stories){const c=scope.candidates.find(c=>c.targetVersionId===s.targetVersionId)!;s.previousLedgerEntryIds=['history-'+c.targetVersionId];if(falseCorrection&&c.facts[0].text.includes('Hermes'))s.deltaType='CORRECTION';}
  const plan=await prepareEditorialPlan(store,scope,DEFAULT_BRIEFING_BUDGET,window.end,{model:'controlled',usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async()=>({value:compactEditorialInput(scope).encode(body),usage:{calls:1,costUsd:.001,reported:true}})});
  const selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan),usage={tokensIn:100,tokensOut:40,cost:.001,confirmed:true};let repairs=0;
  const model:BriefingModelPort={model:'controlled',provider:'TEST',maxCallCostUsd:.01,synthesize:async input=>({draft:{language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:s.approvedFacts!.map(f=>({text:f.text,support:f.support}))}))},usage}),repair:async()=>{repairs++;throw Error('Repeated story must not be rewritten');},verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>f.id)),novelFactIds:claims.filter(c=>!allRepeated&&!c.text.includes('Hermes')).flatMap(c=>(c.requiredFacts??[]).map(f=>f.id)),semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,nonRepetitive:true,reason:'Complete grounded prose.',readerSpans:[{claimId:c.id,text:c.text}],readerNovelty:{status:allRepeated||c.text.includes('Hermes')?'ALREADY_COMMUNICATED' as const:'NEW' as const,reason:'Compared with supplied same-story history.',previousFactTexts:allRepeated||c.text.includes('Hermes')?c.previousLedgerFacts!:[]}}))),usage})};
  if(allRepeated){await expect(publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model,requireModel:true})).rejects.toBeInstanceOf(QuietPublication);expect(await store.list('feed-1','editions')).toHaveLength(0);expect((await store.list<any>('feed-1','briefing_requests'))[0]).toMatchObject({state:'DONE',result:'QUIET'});}
  else{const edition=await publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model,requireModel:true});expect(edition.stories).toHaveLength(1);expect(edition.stories[0].claims[0].text).toContain('OpenAI');expect(await publishSelection(store,'feed-1',selection.id,{now:()=>window.end,model,requireModel:true})).toEqual(edition);}
  expect(repairs).toBe(0);expect(await store.list('feed-1','publication_reconciliations')).toHaveLength(1);
 }finally{await ctx.dispose()}
},30000);

import {beforeEach,afterEach,it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence,acceptEvidence} from './test-utils';
import {processEvidenceIntelligence} from './engine';
import anthropic from './fixtures/staging-anthropic-report-date.json';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan,fallbackEditorialPlan} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
import {projectEditionLedger} from './ledger';
import {withdrawV1Edition} from './public-read';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection,extractiveDraft,approvedSupportSpans,type BriefingModelPort,type SynthesisInput,type SynthesisWriterInput} from './publication';
const A='Officials said Lebanon banking reform will start after 2026-10-06.';
const B='Lebanon banking reform may affect 100 depositors.';
const C='Lebanon banking reform also creates 900 new offices.';
const body=[A,B,C].join(' '),window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store,1,body);});
afterEach(async()=>ctx.dispose());
it.each([true,false])('unchanged-fact publication correction requires independent delivery attestation (%s)',async verified=>{
 const originalScope=await prepareSemanticShortlist(store,'feed-1',window,window.end),originalPlan=await prepareEditorialPlan(store,originalScope,DEFAULT_BRIEFING_BUDGET,window.end),originalSelection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,originalPlan);
 const original=await publishSelection(store,'feed-1',originalSelection.id,{now:()=>window.end});await projectEditionLedger(store,'feed-1',original.id);
 await withdrawV1Edition(ctx.db,original.id,feedFixture.ownerId,'POLICY_REQUIRED','2026-10-03T13:30:00Z');
 const next={...window,start:window.end,end:'2026-10-03T14:00:00Z'},scope=await prepareSemanticShortlist(store,'feed-1',next,next.end),body=fallbackEditorialPlan(scope);
 for(const story of body.stories){const c=scope.candidates.find(c=>c.targetVersionId===story.targetVersionId)!;Object.assign(story,{decision:'SELECT',treatment:'STANDARD',deltaType:'CORRECTION',newUnderstandingFactIds:[],mustIncludeFactIds:c.facts.map(f=>f.id),previousLedgerEntryIds:scope.ledger.map(e=>e.id)});}
 body.obligations=scope.obligations.map(o=>({obligationId:o.id,handling:'ADDRESS',targetVersionId:scope.candidates.find(c=>c.correctionObligationIds.includes(o.id))!.targetVersionId,reason:'Correct withdrawn prior reader communication.'}));
 const plan=await prepareEditorialPlan(store,scope,DEFAULT_BRIEFING_BUDGET,next.end,{model:'controlled-planner',usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async()=>({value:compactEditorialInput(scope).encodeKeyed(body),usage:{calls:1,costUsd:.001,reported:true}})}),selected=await scoreAndSelect(store,'feed-1',next,DEFAULT_BRIEFING_BUDGET,next.end,undefined,plan),usage={tokensIn:100,tokensOut:40,cost:.001,confirmed:true};
 const model:BriefingModelPort={model:'controlled',provider:'TEST',maxCallCostUsd:.01,synthesize:async input=>({draft:{language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:[{text:'An earlier Distilled briefing was withdrawn. '+s.approvedFacts!.map(f=>f.text).join(' '),support:s.approvedSpans!,communicatedFactIds:s.approvedFacts!.map(f=>f.id)}]}))},usage}),verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>f.id)),novelFactIds:[],addressedCorrectionObligationIds:claims.flatMap(c=>(c.correctionObligations??[]).map(o=>o.id)),semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,nonRepetitive:true,reason:'Supported explicit correction of prior withdrawn reader communication.',readerSpans:[{claimId:c.id,text:c.text}]}))),usage})};
 if(!verified){model.verify=async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>f.id)),novelFactIds:[],addressedCorrectionObligationIds:[],semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Facts are supported but no corrective delivery was attested.',readerSpans:[{claimId:c.id,text:c.text}]}))),usage});await expect(publishSelection(store,'feed-1',selected.id,{now:()=>next.end,model,requireModel:true})).rejects.toMatchObject({code:'INVALID_REQUEST'});expect(await store.list('feed-1','correction_resolutions')).toHaveLength(0);expect(await store.list('feed-1','editions')).toHaveLength(1);return;}
 const corrected=await publishSelection(store,'feed-1',selected.id,{now:()=>next.end,model,requireModel:true});await projectEditionLedger(store,'feed-1',corrected.id);
 expect(scope.obligations.length).toBeGreaterThan(0);expect(await store.list('feed-1','correction_resolutions')).toHaveLength(scope.obligations.length);
 expect(await publishSelection(store,'feed-1',selected.id,{now:()=>next.end,model})).toEqual(corrected);
},25000);
async function selection(normalized=false,approved=[A,B]){
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),proposed=fallbackEditorialPlan(shortlist);
 if(normalized)for(const s of proposed.stories){const facts=shortlist.candidates.find(c=>c.targetVersionId===s.targetVersionId)!.facts,allowed=new Set(facts.filter(f=>approved.includes(f.text)).map(f=>f.id));for(const key of ['mustIncludeFactIds','newUnderstandingFactIds','contextFactIds','attributionFactIds','certaintyFactIds','disagreementFactIds','openQuestionFactIds'] as const)s[key]=s[key].filter(id=>allowed.has(id));s.newUnderstandingFactIds=[...allowed];s.mustIncludeFactIds=[...allowed].slice(0,1)}
 const plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,normalized?{model:'normalization-editor',usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async()=>({value:compactEditorialInput(shortlist).encodeKeyed(proposed),usage:{calls:1,costUsd:.001,reported:true}})}:undefined);
 for(const s of plan.stories){const facts=shortlist.candidates.find(c=>c.targetVersionId===s.targetVersionId)!.facts;const allowed=new Set(facts.filter(f=>approved.includes(f.text)).map(f=>f.id));
  for(const key of ['mustIncludeFactIds','newUnderstandingFactIds','contextFactIds','attributionFactIds','certaintyFactIds','disagreementFactIds','openQuestionFactIds'] as const)s[key]=s[key].filter(id=>allowed.has(id));
 }
 plan.id+=':approved-ab';
 await feedTransact(store,'feed-1',tx=>tx.write('editorial_plans',plan.id,plan));
 return scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan);
}
it.each([false,true])('blocks persisted Anthropic strengthening; bounded repair preserves all facts and citations (%s)',async repair=>{
 // Local retained-corpus replay, with genuine TITLE/BODY provenance and no
 // source fetch or model provider. Reset only this ephemeral test database.
 await ctx.dispose();ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);
 await store.registerFeed({...feedFixture,title:'AI Industry Watch',interests:['AI usage policy'],geography:[]});
 const facts=anthropic.facts.map(f=>f.text);
 await acceptEvidence(store,1,facts.slice(1).join(' '),'publisher-1',testPolicy.now(),'en','2026-10-03T10:00:00Z',facts[0]);
 await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),testPolicy.now());
 const selected=await selection(true,facts),usage={tokensIn:100,tokensOut:40,cost:.001,confirmed:true};let verifies=0,repairs=0;
 const draft=(input:SynthesisWriterInput,repaired=false)=>({language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:[{text:repaired?facts.join('. ').replace(/\.\./g,'.'):anthropic.claim.replace('On October 8, 2026, ',''),support:s.approvedSpans!,communicatedFactIds:s.approvedFacts!.map(f=>f.id)}]}))});
 const model:BriefingModelPort={model:'permissive-entailment',provider:'TEST',requiresFullEntailment:true,maxCallCostUsd:.01,
  synthesize:async input=>({draft:draft(input),usage}),
  verify:async claims=>{verifies++;return {supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>f.id)),novelFactIds:claims.flatMap(c=>(c.newUnderstandingFacts??[]).map(f=>f.id)),claimEntailment:claims.map(c=>({claimId:c.id,fullyEntailed:true,unsupportedMeaning:[],reason:'Independently permissive verifier.'})),semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,readerNovelty:{status:'NEW' as const,reason:'First communication.',previousFactTexts:[]},reason:'Permissive approval.',readerSpans:[{claimId:c.id,text:c.text}]}))),usage};}};
 if(repair)model.repair=async(input,_failed,feedback)=>{repairs++;expect(feedback.issues.some(i=>i.code==='UNSUPPORTED_ACTION_STRENGTH')).toBe(true);expect(input.stories.flatMap(s=>s.approvedFacts!).map(f=>f.text)).toEqual(expect.arrayContaining(facts));return {draft:draft(input,true),usage};};
 if(!repair){
  await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model,requireModel:true})).rejects.toMatchObject({code:'INVALID_REQUEST'});
  expect(await store.list('feed-1','editions')).toHaveLength(0);expect(verifies).toBe(0);
  const retained=await store.list<any>('feed-1','drafts');expect(retained[0].draft.stories[0].claims[0].communicatedFactIds).toHaveLength(3);expect(retained[0].draft.stories[0].claims[0].support.some((s:any)=>s.quote===facts[0])).toBe(true);
 }else{
  const edition=await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model,requireModel:true});
  const claims=edition.stories.flatMap(s=>s.claims);expect(claims[0].communicatedFactIds).toHaveLength(3);for(const f of facts)expect(claims[0].text).toContain(f);
  for(const f of facts)expect(claims.flatMap(c=>c.support).some(s=>s.quote.includes(f))).toBe(true);expect(edition.generation.repairCount).toBe(1);expect(repairs).toBe(1);expect(verifies).toBe(1);
  expect(await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model,requireModel:true})).toEqual(edition);expect(repairs).toBe(1);expect(verifies).toBe(1);
 }
 expect(JSON.stringify(await store.list('feed-1','verification_feedback'))).toContain('UNSUPPORTED_ACTION_STRENGTH');
},25000);
it.each(['event','report','publisher-report'] as const)('publication cannot promote a source date to an event date despite permissive semantic verification (%s)',async role=>{
 const selected=await selection(true),usage={tokensIn:100,tokensOut:40,cost:.001,confirmed:true};
 const model:BriefingModelPort={model:'controlled-permissive-verifier',provider:'TEST',requiresFullEntailment:true,maxCallCostUsd:.01,
  synthesize:async input=>({draft:{language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:s.approvedFacts!.map(f=>({text:f.text===A?(role==='event'?'On October 3, 2026, ':role==='publisher-report'?'A report from the source dated October 3, 2026 states: ':'A report published on October 3, 2026 states: ')+f.text:f.text,support:f.support,communicatedFactIds:[f.id]}))}))},usage}),
  verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>f.id)),novelFactIds:claims.flatMap(c=>(c.newUnderstandingFacts??[]).map(f=>f.id)),claimEntailment:claims.map(c=>({claimId:c.id,fullyEntailed:true,reason:'Permissive approval.',unsupportedMeaning:[]})),semanticChecks:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>({factId:f.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,readerNovelty:{status:'NEW' as const,reason:'First communication.',previousFactTexts:[]},reason:'Permissive temporal approval.',readerSpans:[{claimId:c.id,text:c.text}]}))),usage})};
 if(role==='event'){
  await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model,requireModel:true})).rejects.toMatchObject({code:'INVALID_REQUEST'});
  expect(await store.list('feed-1','editions')).toHaveLength(0);
  expect(JSON.stringify(await store.list('feed-1','verification_feedback'))).toContain('UNSUPPORTED_DATE');
 }else{
  const edition=await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model,requireModel:true});
  expect(edition.stories.flatMap(s=>s.claims).map(c=>c.text).join(' ')).toContain(role==='publisher-report'?'A report from the source dated October 3, 2026':'A report published on October 3, 2026');
  expect(await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model,requireModel:true})).toEqual(edition);
 }
},25000);
it.each([true,false])('normalized new facts must both survive independently verified publication (%s)',async complete=>{
 const selected=await selection(true),usage={tokensIn:100,tokensOut:40,cost:.001,confirmed:true};
 const draft=(input:SynthesisWriterInput)=>({language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:s.approvedFacts!.filter(f=>complete||f.text===A).map(f=>({text:f.text,support:f.support,communicatedFactIds:[f.id]}))}))});
 const model:BriefingModelPort={model:'coverage-writer',provider:'TEST',maxCallCostUsd:.01,synthesize:async input=>{expect(input.stories.flatMap(s=>s.plan!.mustIncludeFactIds)).toHaveLength(2);return {draft:draft(input),usage}},repair:async input=>({draft:draft(input),usage}),verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).filter(f=>claims.some(p=>p.text===f.text)).map(f=>f.id)),novelFactIds:claims.flatMap(c=>(c.newUnderstandingFacts??[]).filter(f=>claims.some(p=>p.text===f.text)).map(f=>f.id)),usage})};
 if(!complete){await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model,requireModel:true})).rejects.toMatchObject({code:'INVALID_REQUEST'});expect(await store.list('feed-1','editions')).toHaveLength(0);return;}
 const edition=await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model,requireModel:true});expect(edition.stories.flatMap(s=>s.claims).map(c=>c.text)).toEqual([A,B]);
},25000);
it('renders only approved A/B with exact spans, required coverage and idempotent immutable publication',async()=>{
 const selected=await selection(),edition=await publishSelection(store,'feed-1',selected.id,{now:()=>window.end});
 expect(edition.stories.flatMap(s=>s.claims).map(c=>c.text).join(' ')).toBe(A+' '+B);
 for(const c of edition.stories.flatMap(s=>s.claims)){expect(c.support[0].quote).toBe(c.text);expect((await store.revision('feed-1',c.support[0].evidenceRevisionId))!.body).toContain(c.support[0].quote);}
 expect(await publishSelection(store,'feed-1',selected.id,{now:()=>window.end})).toEqual(edition);
 expect(await store.list('feed-1','editions')).toHaveLength(1);
},25000);
it.each(['whole source','unapproved fact','missing required','attribution','certainty','temporal'])('rejects %s and fences writer access to unapproved C',async mode=>{
 const selected=await selection(),usage={tokensIn:100,tokensOut:40,cost:.001,confirmed:true};
 const model:BriefingModelPort={model:'controlled',provider:'TEST',maxCallCostUsd:.01,synthesize:async input=>{
  expect(JSON.stringify(input)).not.toContain(C);expect(input.stories[0]).not.toHaveProperty('eventVersions');
  expect(input.stories[0].plan).not.toHaveProperty('facts');
  expect(input.stories[0].approvedFacts?.map(f=>f.text)).toEqual([A,B]);
  expect(input.stories[0].approvedFacts?.every(f=>f.support.length>0&&!('claimMentionIds' in f))).toBe(true);
  const s=input.stories[0],id=s.evidence[0].id;
  const texts=mode==='whole source'?[body]:mode==='unapproved fact'?[A,B,C]:mode==='missing required'?[A]:mode==='attribution'?[A.replace('Officials said ',''),B]:mode==='certainty'?[A,B.replace('may affect','affects')]:[A.replace('will start after','started before'),B];
  return {draft:{language:'en',stories:[{candidateId:s.candidate.id,claims:texts.map((text,i)=>({text,support:[{evidenceRevisionId:id,quote:mode==='whole source'?body:i===2?C:i===0?A:B}]}))}]},usage};
 },verify:async claims=>({supportedClaimIds:claims.filter(c=>[A,B].includes(c.text)).map(c=>c.id),preservedFactIds:[],novelFactIds:claims.flatMap(c=>(c.newUnderstandingFacts??[]).map(f=>f.id)),usage})};
 await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(await store.list('feed-1','editions')).toHaveLength(0);
},25000);
it('keeps unsafe rebuttal and nonliteral approved facts closed',()=>{
 const input={feed:{outputLanguage:'en'},editorialPlan:{id:'p'},stories:[{candidate:{id:'c'},plan:{facts:[{id:'a',text:A,evidenceRevisionIds:['r']}],mustIncludeFactIds:['a'],newUnderstandingFactIds:['a'],contextFactIds:[],attributionFactIds:[],certaintyFactIds:[],disagreementFactIds:[],openQuestionFactIds:[]},evidence:[{id:'r',language:'en',body:A+' Verdict: false.'}]}]} as unknown as SynthesisInput;
 expect(()=>extractiveDraft(input)).toThrowError(expect.objectContaining({reason:'EXTRACTIVE_CAPACITY_UNSUPPORTED'}));
 input.stories[0].evidence[0].body='A paraphrased source with no exact approved span.';
 expect(()=>extractiveDraft(input)).toThrowError(expect.objectContaining({reason:'EXTRACTIVE_CAPACITY_UNSUPPORTED'}));
});
it('joins adjacent approved date fragments without including an unapproved tail',()=>{
 const story={plan:{facts:[{id:'a',text:'The spacecraft will dock on Oct.',evidenceRevisionIds:['r']},{id:'b',text:'2.',evidenceRevisionIds:['r']}],mustIncludeFactIds:['a','b'],newUnderstandingFactIds:['a','b'],contextFactIds:[],attributionFactIds:[],certaintyFactIds:[],disagreementFactIds:[],openQuestionFactIds:[]},evidence:[{id:'r',body:'The spacecraft will dock on Oct. 2. Unapproved extra information.'}]} as unknown as SynthesisInput['stories'][number];
 expect(approvedSupportSpans(story)).toEqual([{evidenceRevisionId:'r',quote:'The spacecraft will dock on Oct. 2.'}]);
 story.plan!.mustIncludeFactIds=['a'];story.plan!.newUnderstandingFactIds=['a'];
 expect(()=>approvedSupportSpans(story)).toThrowError(expect.objectContaining({reason:'EXTRACTIVE_CAPACITY_UNSUPPORTED'}));
});
it('keeps a repeated RSS title as an exact title span without relaxing body sentence boundaries',()=>{
 const title='Lebanon banking reform',sentence='Lebanon Parliament approved banking reform legislation.';
 const story={plan:{facts:[{id:'t',text:title,evidenceRevisionIds:['r']},{id:'b',text:sentence,evidenceRevisionIds:['r']}],
  mustIncludeFactIds:['t','b'],newUnderstandingFactIds:['t','b'],contextFactIds:[],attributionFactIds:[],certaintyFactIds:[],disagreementFactIds:[],openQuestionFactIds:[]},
  evidence:[{id:'r',title,body:`${title}. ${sentence} Unapproved extra information.`}]} as unknown as SynthesisInput['stories'][number];
 expect(approvedSupportSpans(story)).toEqual([{evidenceRevisionId:'r',quote:sentence},{evidenceRevisionId:'r',quote:title}]);
 story.plan!.facts[1].text='Parliament approved banking reform';
 expect(()=>approvedSupportSpans(story)).toThrowError(expect.objectContaining({reason:'EXTRACTIVE_CAPACITY_UNSUPPORTED'}));
});
it('uses a safe deterministic draft after model failure, retains unknown-call reservation and never repeats the call',async()=>{
 const selected=await selection();let calls=0;
 const model:BriefingModelPort={model:'unavailable',provider:'TEST',maxCallCostUsd:.01,synthesize:async()=>{calls++;throw Error('response unavailable');}};
 await ctx.db.exec("CREATE TRIGGER fail_approved_publication BEFORE INSERT ON v1_feed_documents WHEN NEW.kind='editions' BEGIN SELECT RAISE(ABORT,'simulated persistence outage'); END;");
 await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 await ctx.db.exec('DROP TRIGGER fail_approved_publication;');
 const edition=await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model});
 expect(edition.generation.provider).toBe('NONE');expect(edition.generation.usageConfirmed).toBe(false);expect(edition.generation.cost).toBe(.01);
 expect(await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model})).toEqual(edition);expect(calls).toBe(1);
 expect((await store.list<any>('feed-1','model_executions'))[0]).toMatchObject({status:'OUTCOME_UNKNOWN',reservationRetained:true});
},25000);

it.each(['missing declaration','false coverage IDs','invalid quote'])('repairs %s once with the same restricted facts and independently verifies prose',async mode=>{
 const selected=await selection(),usage={tokensIn:100,tokensOut:40,cost:.001,confirmed:true};let writes=0,repairs=0,verifications=0;
 const make=(input:any,complete:boolean)=>{const s=input.stories[0],facts=s.approvedFacts,id=s.evidence[0].id;
  return {language:'en',stories:[{candidateId:s.candidate.id,claims:[{text:complete?A:mode==='invalid quote'?`Officials said "Lebanon banking reform will start after 2026-10-06."`:mode==='false coverage IDs'?A+' Reform may affect 100 people.':A,support:[{evidenceRevisionId:id,quote:A},...(!complete&&mode==='false coverage IDs'?[{evidenceRevisionId:id,quote:B}]:[])],communicatedFactIds:mode==='false coverage IDs'?facts.map((f:any)=>f.id):[facts[0].id]},...(complete?[{text:B,support:[{evidenceRevisionId:id,quote:B}],communicatedFactIds:[facts[1].id]}]:[])]}]};};
 const model:BriefingModelPort={model:'controlled-writer',provider:'TEST',maxCallCostUsd:.01,synthesize:async input=>{writes++;return {draft:make(input,false),usage};},repair:async(input,draft,feedback)=>{
  repairs++;expect(JSON.stringify(input)).not.toContain(C);expect(draft.stories[0].claims).toHaveLength(1);
  expect(feedback.issues.some(i=>mode==='invalid quote'?i.code==='INVALID_DIRECT_QUOTE':i.code.startsWith('MISSING_'))).toBe(true);
  if(mode!=='invalid quote')expect(feedback.missingFactIds.length).toBeGreaterThan(0);
  return {draft:make(input,true),usage};
 },verify:async claims=>{verifications++;const expressed=claims.map(c=>c.text).join(' ');return {supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>c.requiredFacts??[]).filter(f=>expressed.includes(f.text)).map(f=>f.id),novelFactIds:claims.flatMap(c=>c.newUnderstandingFacts??[]).filter(f=>expressed.includes(f.text)).map(f=>f.id),usage};}};
 // Force a retry after the repair result and independent verification are durable.
 await ctx.db.exec("CREATE TRIGGER fail_repaired_publication BEFORE INSERT ON v1_feed_documents WHEN NEW.kind='editions' BEGIN SELECT RAISE(ABORT,'simulated persistence outage'); END;");
 await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 await ctx.db.exec('DROP TRIGGER fail_repaired_publication;');
 const calls=[writes,repairs,verifications],edition=await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model});
 expect(edition.generation).toMatchObject({provider:'TEST',repairCount:1});
 expect(edition.stories.flatMap(s=>s.claims).map(c=>c.text)).toEqual([A,B]);
 expect([writes,repairs,verifications]).toEqual(calls);expect(writes).toBe(1);expect(repairs).toBe(1);
 expect(verifications).toBe(mode==='false coverage IDs'?2:1);
 expect(await store.list('feed-1','verification_feedback')).toHaveLength(1);
 expect(await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model})).toEqual(edition);
 expect(await store.list('feed-1','editions')).toHaveLength(1);
},25000);

it('fails closed after a second invalid draft without another repair or publication',async()=>{
 const selected=await selection(),usage={tokensIn:100,tokensOut:40,cost:.001,confirmed:true};let writes=0,repairs=0;
 const omit=(input:any)=>{const s=input.stories[0];return {language:'en',stories:[{candidateId:s.candidate.id,claims:[{text:A,support:[{evidenceRevisionId:s.evidence[0].id,quote:A}],communicatedFactIds:[s.approvedFacts[0].id]}]}]};};
 const model:BriefingModelPort={model:'controlled',provider:'TEST',maxCallCostUsd:.01,synthesize:async input=>{writes++;return {draft:omit(input),usage};},repair:async input=>{repairs++;return {draft:omit(input),usage};}};
 await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(writes).toBe(1);expect(repairs).toBe(1);expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect(await store.list('feed-1','verification_feedback')).toHaveLength(2);
},25000);

it('accepts a grounded plain paraphrase with all required facts and exact provenance',async()=>{
 const selected=await selection(),usage={tokensIn:100,tokensOut:40,cost:.001,confirmed:true};
 const model:BriefingModelPort={model:'controlled',provider:'TEST',maxCallCostUsd:.01,synthesize:async input=>{const s=input.stories[0];return {draft:{language:'en',stories:[{candidateId:s.candidate.id,claims:s.approvedFacts!.map(f=>({text:f.text===B?B.replace('may affect','could affect'):f.text,support:f.support,communicatedFactIds:[f.id]}))}]},usage};},verify:async claims=>({supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>f.id)),novelFactIds:claims.flatMap(c=>(c.newUnderstandingFacts??[]).map(f=>f.id)),usage})};
 const edition=await publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model});
 expect(edition.stories[0].claims.map(c=>c.text)).toEqual([A,B.replace('may affect','could affect')]);
 expect(edition.stories[0].claims[1].support).toEqual([{evidenceRevisionId:edition.evidenceRevisionIds[0],quote:B}]);
},25000);

it('required real-model publication fails closed without extractive recovery or a repeated unknown call',async()=>{
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,window.end),plan=await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,window.end,{model:'controlled-planner',usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async()=>({value:compactEditorialInput(shortlist).encodeKeyed(fallbackEditorialPlan(shortlist)),usage:{calls:1,costUsd:.001,reported:true}})});
 expect(plan.route).toBe('GPT');
 const selected=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,window.end,undefined,plan);
 let calls=0;
 const model:BriefingModelPort={model:'controlled',provider:'TEST',maxCallCostUsd:.01,synthesize:async()=>{calls++;throw Error('simulated provider failure')},verify:async()=>{throw Error('must not verify a fallback')}};
 await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model,requireModel:true})).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 // An ordinary retry must inherit the stored requirement even without the flag.
 await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end,model})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(calls).toBe(1);expect(await store.list('feed-1','editions')).toHaveLength(0);expect(await store.list('feed-1','drafts')).toHaveLength(0);
 expect(await store.list('feed-1','model_intents')).toHaveLength(1);
 expect((await store.list<{requireModel?:boolean}>('feed-1','briefing_requests'))[0].requireModel).toBe(true);
},25000);

it('persists the real-model requirement before a pre-call failure and rejects an ordinary offline retry',async()=>{
 const selected=await selection();
 await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end,requireModel:true})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(await store.list('feed-1','model_intents')).toHaveLength(0);
 // Without a durable requirement this second call would publish an extractive
 // draft from the approved facts; the retry intentionally has no strict flag.
 await expect(publishSelection(store,'feed-1',selected.id,{now:()=>window.end})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect(await store.list('feed-1','drafts')).toHaveLength(0);
 expect((await store.list<{requireModel?:boolean}>('feed-1','briefing_requests'))[0].requireModel).toBe(true);
},25000);

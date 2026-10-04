import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {DeterministicSalienceScorer,JevSalienceScorer,GptSalienceScorer,OpenRouterJudgmentClient,type SalienceInput} from './salience';
import {evaluateSalience,evaluateStorylineChanges,evaluateDistillation,inputFingerprint,type StorylineChangeInput} from './editorial-evaluation';
const frozen=JSON.parse(readFileSync(new URL('../../../../evaluation/editorial-v1/inputs.v1.json',import.meta.url),'utf8')) as {events:SalienceInput[];storylineChanges:StorylineChangeInput[]};
const annotation={origin:'HUMAN',annotatorId:'synthetic-arithmetic-test-not-gold',createdAt:'2026-10-04T00:00:00Z',labelPolicyVersion:'synthetic-test-v1'};
it('measures deterministic execution on frozen unlabeled inputs without inventing quality',async()=>{
 const labelsPath=process.env.DISTILLED_EDITORIAL_LABELS_PATH,labels=labelsPath?JSON.parse(readFileSync(labelsPath,'utf8')):undefined;
 const eventReport=await evaluateSalience(frozen.events,new DeterministicSalienceScorer(),3,labels);
 const changeReport=await evaluateStorylineChanges(frozen.storylineChanges);
 expect(eventReport.rows).toHaveLength(8);expect(eventReport.efficiency.modelCalls).toBe(0);expect(eventReport.efficiency.reportedCostUsd).toBe(0);
 if(!labels) expect(eventReport.quality.status).toBe('PENDING_HUMAN_LABELS');
 expect(changeReport.quality.status).toBe('PENDING_HUMAN_LABELS');
 const rerun=await evaluateSalience(frozen.events,new DeterministicSalienceScorer(),3,labels);
 expect(rerun.ranking).toEqual(eventReport.ranking);expect(rerun.datasetHash).toBe(eventReport.datasetHash);
 const providerStatus=!process.env.OPENROUTER_API_KEY?'NOT_RUN_NO_LOCAL_CREDENTIALS':process.env.DISTILLED_EDITORIAL_PAID_SMOKE==='true'?'SEPARATE_OPT_IN_SMOKE':'NOT_RUN_PAID_SMOKE_DISABLED';
 console.info('EDITORIAL_EVALUATION',JSON.stringify({proof:'LOCAL_UNLABELED_FIXTURES',eventReport,changeReport,providers:{JEV:providerStatus,GPT:providerStatus},humanDistillationQuality:'PENDING_HUMAN_LABELS'}));
});
it('checks metric arithmetic with clearly synthetic test labels and rejects mismatched frozen inputs',async()=>{
 // These mocked labels test arithmetic only and are never benchmark gold.
 const inputs=frozen.events.slice(0,3),labels={...annotation,datasetHash:await inputFingerprint(inputs),events:inputs.map((i,n)=>({targetVersionId:i.targetVersionId,importance:n,important:n===2,noise:n===0}))};
 const scorer={score:(input:SalienceInput)=>({...new DeterministicSalienceScorer().score(input),components:{...new DeterministicSalienceScorer().score(input).components,overallScore:inputs.findIndex(i=>i.targetVersionId===input.targetVersionId)/2}})};
 const report=await evaluateSalience(inputs,scorer,1,labels);
 expect(report.quality).toMatchObject({importantRecallAtK:1,ndcgAtK:1,falseNoiseInclusion:0,importantOmission:0,humanPairwiseRankingAgreement:1});
 await expect(evaluateSalience(inputs,scorer,1,{...labels,datasetHash:'0'.repeat(64)})).rejects.toThrow('LABEL_INPUT_MISMATCH');
 expect(labels.events[0].importance).toBe(0);
});
it('calculates preservation/repeat/grounding/reading metrics only from supplied output-bound labels',async()=>{
 const snapshot={editionId:'fixture',claims:[{id:'c1',text:'Government reported 20.'},{id:'c2',text:'Union reported 100.'}],sourceFactIds:['f1','f2'],candidateEventIds:['e1','noise'],selectedEventIds:['e1']};
 const pending=await evaluateDistillation(snapshot);expect(pending.quality.status).toBe('PENDING_HUMAN_LABELS');expect(pending.readingWords).toBe(6);
 const labels={...annotation,outputHash:await inputFingerprint(snapshot),requiredFacts:[{id:'f1',retained:true},{id:'f2',retained:false}],claims:[{id:'c1',supported:true,unnecessaryRepeat:false,redundant:false,correctDelta:true},{id:'c2',supported:false,unnecessaryRepeat:true,redundant:true,correctDelta:false}],noiseEventIds:['noise'],storylineCoherence:3,humanUsefulness:2};
 const report=await evaluateDistillation(snapshot,labels);expect(report.quality).toMatchObject({signalRetention:.5,informationLoss:.5,noiseRejection:1,repeatRate:.5,redundancy:.5,grounding:.5,unsupportedClaimRate:.5,deltaCorrectness:.5});
 await expect(evaluateDistillation({...snapshot,claims:[]},labels)).rejects.toThrow('LABEL_INPUT_MISMATCH');
});
it('keeps separate storyline judgments interchangeable with optional bounded model clients',async()=>{
 const client=new OpenRouterJudgmentClient({kind:'JEV',apiKey:'synthetic',model:'fixture',maxCalls:1,maxCostUsd:.04,maxCallCostUsd:.04,fetcher:async()=>Response.json({answers:{judgment:{type:'choice',choice:'TURNING_POINT',confidence:.9,probabilities:{NO_MEANINGFUL_CHANGE:0,MINOR_UPDATE:0,MATERIAL_UPDATE:0,MAJOR_STATE_CHANGE:.1,TURNING_POINT:.9}}},usage:{input_tokens:50,output_tokens:10,cost:.001}})});
 const report=await evaluateStorylineChanges([frozen.storylineChanges[1]],client);expect(report.rows[0].change).toBe('TURNING_POINT');expect(report.quality.status).toBe('PENDING_HUMAN_LABELS');expect(report.rows[0].usage.calls).toBe(1);
});
it.skipIf(process.env.DISTILLED_EDITORIAL_PAID_SMOKE!=='true')('allows only an explicit bounded paid smoke when local credentials are supplied',async()=>{
 const key=process.env.OPENROUTER_API_KEY;if(!key) throw Error('PAID_SMOKE_REQUIRES_LOCAL_OPENROUTER_KEY');
 if(!process.env.DISTILLED_JEV_MODEL || !process.env.DISTILLED_EDITORIAL_GPT_MODEL) throw Error('PAID_SMOKE_REQUIRES_EXPLICIT_MODELS');
 const reports=[];
 for(const kind of ['JEV','GPT'] as const) {
  const model=kind==='JEV'?process.env.DISTILLED_JEV_MODEL:process.env.DISTILLED_EDITORIAL_GPT_MODEL;if(!model) throw Error('PAID_SMOKE_REQUIRES_EXPLICIT_MODEL');
  const client=new OpenRouterJudgmentClient({kind,apiKey:key,model,maxCalls:1,maxCostUsd:.02,maxCallCostUsd:.02});
  const event=await evaluateSalience([frozen.events[0]],kind==='JEV'?new JevSalienceScorer(client):new GptSalienceScorer(client),1);
  const changeClient=new OpenRouterJudgmentClient({kind,apiKey:key,model,maxCalls:1,maxCostUsd:.02,maxCallCostUsd:.02});
  const change=await evaluateStorylineChanges([frozen.storylineChanges[1]],changeClient);
  reports.push({kind,event,change});
 }
 console.info('BOUNDED_PROVIDER_SMOKE',JSON.stringify({proof:'SMOKE_ONLY_NOT_COMPARATIVE_QUALITY',maximumReservedCostUsd:.08,reports}));
},25000);

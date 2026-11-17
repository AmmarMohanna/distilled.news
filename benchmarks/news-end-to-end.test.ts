import {it,expect} from 'vitest';
import {sourceCorpus,measureNewsRun,briefingReviewSheet,assertNewsBudget,replayNewsWindow} from './news-end-to-end';

it('retains exact real source identity and rejects conflicting saved copies',()=>{
 const input=[{id:'r',title:'A',text:'Original article.'}];
 expect(sourceCorpus(input)[0]).toMatchObject({id:'r',body:'Original article.',sourceHash:expect.stringMatching(/^[a-f0-9]{64}$/)});
 expect(()=>sourceCorpus([...input,{...input[0],text:'Changed article.'}])).toThrow('CONFLICTING_SOURCE_COPY');
 expect(sourceCorpus([...input,...input])).toHaveLength(1);
});
it('places replay cutoff strictly after import without rewriting the original window',()=>{
 const instant='2026-10-20T16:00:00.000Z',window={start:'2026-10-17T00:00:00Z',end:instant,kind:'DAILY' as const},result=replayNewsWindow(instant,window);
 expect(Date.parse(result.end)).toBeGreaterThan(Date.parse(instant));expect(window.end).toBe(instant);expect(result.start).toBe(window.start);
});
it('records failed stage and total wall time without claiming a useful briefing',async()=>{
 let tick=0;const report=await measureNewsRun(async stage=>{
  await stage('ACQUISITION_IMPORT',async()=>{tick+=5;return 'ok'});
  await stage('FACTUAL_VERIFICATION',async()=>{tick+=7;throw Error('INVALID_READER_WITNESS')});
 },()=>tick);
 expect(report).toMatchObject({status:'FAILED',wallMs:12,timeToUsefulBriefingMs:null,error:'INVALID_READER_WITNESS'});
 expect(report.stages).toEqual([{name:'ACQUISITION_IMPORT',wallMs:5,status:'SUCCEEDED'},{name:'FACTUAL_VERIFICATION',wallMs:7,status:'FAILED',error:'INVALID_READER_WITNESS'}]);
});
it('requires a nonempty accepted edition before reporting time to useful briefing',async()=>{
 const empty=await measureNewsRun(async()=>({stories:[]}));expect(empty.timeToUsefulBriefingMs).toBeNull();
 const accepted=await measureNewsRun(async stage=>stage('V2_LOCAL_COMMIT',async()=>({stories:[{candidateId:'c',claims:[{text:'A fact.'}]}]})));
 expect(accepted.status).toBe('SUCCEEDED');expect(accepted.timeToUsefulBriefingMs).not.toBeNull();
});
it('keeps editorial quality and paraphrase judgments pending despite exact text diagnostics',()=>{
 const edition={stories:[{candidateId:'a',claims:[{text:'Same fact.'}]},{candidateId:'b',claims:[{text:'Same fact.'}]}]};
 const sheet=briefingReviewSheet(edition);
 expect(sheet.exactRepeatedClaims).toHaveLength(1);
 expect(sheet.qualityReview).toBe('PENDING');expect(sheet.independentHumanGold).toBe(false);
 expect(sheet.dimensions.map(d=>d.dimension)).toEqual(['IMPORTANCE','FACTUAL_ACCURACY','MISSING_DETAILS','REPETITION','CORRECTIONS','ATTRIBUTION_AND_TIME']);
 expect(sheet.dimensions.every(d=>d.verdict==='PENDING')).toBe(true);
});
it('keeps conservative reservations and unknown calls inside the approved workflow cap',()=>{
 expect(()=>assertNewsBudget([{reservedUsd:.2,settled:true,costUsd:.01}],.3)).not.toThrow();
 expect(()=>assertNewsBudget([{reservedUsd:.2,settled:false}],.3)).toThrow('UNCONFIRMED_PRIOR_NEWS_CALL');
 expect(()=>assertNewsBudget(Array.from({length:24},()=>({reservedUsd:.01,settled:true,costUsd:.001})),.01)).toThrow('NEWS_EVALUATION_CALL_CAP');
 expect(()=>assertNewsBudget([{reservedUsd:2.4,settled:true,costUsd:.01}],.2)).toThrow('NEWS_EVALUATION_RESERVATION_CAP');
 expect(()=>assertNewsBudget([],.351)).toThrow('NEWS_EVALUATION_PER_CALL_CAP');
});

it('enforces the separately approved correctness-run cap before a paid call',()=>{
 expect(()=>assertNewsBudget([], .2,{maxCalls:12,maxReservationsUsd:.1})).toThrow('NEWS_EVALUATION_RESERVATION_CAP');
 expect(()=>assertNewsBudget(Array.from({length:12},()=>({reservedUsd:.01,settled:true,costUsd:.005})), .01,{maxCalls:12,maxReservationsUsd:1.5})).toThrow('NEWS_EVALUATION_CALL_CAP');
});

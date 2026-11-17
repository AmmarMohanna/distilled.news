import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {article,FEED,MODELS,scripted,WINDOW} from './helpers';

// These are forensic reproductions of UNRESOLVED semantic failures, not quality
// acceptance tests. A green test means the bad captured behaviour is exposed.
const capture=JSON.parse(readFileSync(new URL('../../../benchmarks/editorial-information-gain/efficient-pilot-interruption-2026-11-07.json',import.meta.url),'utf8'));
const item=(id:string)=>capture.candidateEditorDraft.find((d:any)=>d.id===id);
const review=(id:string)=>capture.originalVerifierResponse.reviews.find((r:any)=>r.developmentId===id);

it('reproduces one compound fact wrongly rejecting new Deir Mimas access with old detention',()=>{
 const d=item('D6'),f=review('D6').facts[0];
 expect(d.facts).toHaveLength(1);
 expect(d.facts[0][2]).toContain('ومنعت حركة الدخول إليها والخروج منها');
 expect(d.facts[0][2]).toContain('أوقفت أحد أبناءها');
 expect(f[2]).toBe(false); // novelty false for the entire compound fact
 expect(f[6]).toContain('يضيف تفاصيل التمركز والمنع');
 expect(capture.baselineItems.some((b:any)=>(b.headline+b.body).includes('الدخول'))).toBe(true);
 // Splitting at every conjunction is unsafe: entry AND exit is one restriction;
 // actor, location and conditions must remain attached to each independent claim.
});

it('confirms existing V4 can judge manually separated developments from one source independently',async()=>{
 const d=item('D6');
 const restriction='القوة الإسرائيلية تمنع الدخول إلى دير ميماس والخروج منها';
 const detention='القوة الإسرائيلية توقف أحد أبناء دير ميماس';
 const m=scripted({edit:[{items:[
  {headline:detention,body:'',sources:['S1'],relation:'update',updates:'detention',importance:2},
  {headline:restriction,body:'',sources:['S1'],relation:'update',updates:'detention',importance:2}
 ]}],verify:[{results:[{i:0,verdict:'redundant',issues:['Already communicated detention.']},{i:1,verdict:'ok'}]}]});
 const r=await generateBriefing({...WINDOW,feed:{...FEED,language:'ar'},
  articles:[article('deir',d.facts[0][2])],prior:[{id:'detention',at:WINDOW.windowStart,headline:detention,body:''}]},
  m.port,MODELS,{now:()=>new Date(WINDOW.windowEnd)});
 expect(r.items.map(i=>i.headline)).toEqual([restriction]);
 expect(r.items[0].sourceIds).toEqual(['deir']);
 expect(m.calls.map(c=>c.stage)).toEqual(['edit','verify']);
 // Scripted boundary/novelty decisions prove representability, not extraction quality.
});

it('reproduces the six-to-three reader correction and demonstrates the remaining V4 false-approval risk',async()=>{
 const d=item('D2');
 const baseline=capture.baselineItems.find((b:any)=>b.relation==='correction');
 expect(baseline.updatesId).toBe('constructed-reader-six');
 expect(d).toMatchObject({relation:'new',prior:null});
 expect(review('D2').relationshipSupported).toBe(true);
 const m=scripted({edit:[{items:[{headline:d.headline,body:'',sources:['S1'],relation:d.relation,updates:null,importance:1}]}],verify:[{results:[{i:0,verdict:'ok'}]}]});
 const r=await generateBriefing({...WINDOW,feed:{...FEED,language:'ar'},
  prior:[{id:baseline.updatesId,at:WINDOW.windowStart,headline:'تقارير عن وقوع ست عمليات سلب في 5 تشرين الثاني',body:''}],
  articles:[article('robbery',d.facts[0][2])]},m.port,MODELS,{now:()=>new Date(WINDOW.windowEnd)});
 expect(m.calls[1].request.user).toContain('ست عمليات');
 expect(r.items[0].relation).toBe('new'); // KNOWN UNRESOLVED: valid schema is not a correct relationship.
});

it('reproduces the camp attribution, uncertainty and geographic-scope failure',()=>{
 const d=item('D3'),r=review('D3');
 expect(d.facts[0][3]).toContain('رندلى جبور');
 expect(d.facts[0][2]).toContain('ربما');
 expect(d.facts[0][2]).toContain('بين عكار وطرابلس');
 expect(d.headline).not.toContain('جبور');
 expect(d.headline).not.toContain('ربما');
 expect(d.headline).not.toContain('عكار');
 expect(d.headline).toContain('مشبوهة');
 expect(r.remainingTextSupported).toBe(true); // False approval despite fuller evidence in its reason.
 expect(r.facts[0][6]).toContain('رندلى جبور');
});

it('reproduces claim-scope coverage exceeding actual traffic prose',()=>{
 const d=item('D4');
 expect(d.facts[0][3]).toContain('سيارتين');
 expect(d.headline).not.toContain('سيارتين');
 expect(d.bodyFacts).toEqual([]);
 expect(review('D4').facts[0][4]).toBe(true); // falsely complete rendering
});

it('retains the low-value political-commentary inclusion as an unresolved selection regression',()=>{
 expect(item('D1').importance).toBe(1);
 expect(item('D1').headline).toContain('يطالب');
 expect(capture.sourceAudit.audits.find((a:any)=>a.id==='selection').severity).toBe('editorial_density');
 expect(capture.status).toBe('INCOMPLETE_PILOT_NOT_QUALIFIED');
});

it('keeps malformed fact-coverage verdicts rejected rather than treating diagnostic normalization as success',()=>{
 expect(capture.protocolFailure).toContain('INVALID_FACT_COVERAGE');
 expect(capture.originalVerifierResponse.reviews.every((r:any)=>r.facts.some((f:any)=>f[5].some((s:string)=>/^S\d+$/.test(s))))).toBe(true);
 expect(capture.diagnosticOnly.status).toBe('COUNTERFACTUAL_SCHEMA_NORMALIZATION_NOT_AN_ACCEPTED_OR_PUBLISHED_RESULT');
 expect(capture.diagnosticOnly.wouldOmitRestriction).toBe(true);
});

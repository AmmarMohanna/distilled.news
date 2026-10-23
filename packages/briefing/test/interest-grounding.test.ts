import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import fixture from './fixtures/v3-interest-grounding.json';
import evidence from '../../../benchmarks/results/v3-interest-grounding/summary.json';
import {EDITOR_SYSTEM,VERIFY_SYSTEM} from '../src/prompts';
import {generateBriefing} from '../src/engine';
import {prepareArticles} from '../src/prepare';
import {FEED,MODELS,scripted} from './helpers';

const result=(name:string)=>evidence.runs.find(r=>r.name===name)!;

it('preserves exact source bytes and matched paid requests, changing one stage prompt at a time',()=>{
  for(const s of fixture.sources)expect(createHash('sha256').update(s.text).digest('hex')).toBe(s.sha256);
  for(const job of evidence.requests){
    expect(createHash('sha256').update(JSON.stringify(job.request)).digest('hex')).toBe(job.requestSha256);
    if(!job.name.includes('-baseline-'))continue;
    const candidate=evidence.requests.find(r=>r.name===job.name.replace('-baseline-','-candidate-'))!;
    expect({...candidate.request,messages:candidate.request.messages.map((m,i)=>i===0?job.request.messages[0]:m)})
      .toEqual(job.request);
  }
  expect(EDITOR_SYSTEM).toContain(fixture.candidate.editor.split("\n").find(line=>line.startsWith("- Use the reader interest"))!);
  expect(VERIFY_SYSTEM).toContain("An implication or connection to the reader topic still needs support in the cited sources");
  expect(evidence.calls).toBe(14);
  expect(evidence.costUsd).toBeLessThan(.19);
  expect(evidence.allSettled).toBe(true);
});

it('records the real English/Arabic improvements without rejecting sourced impacts or concise reporting',()=>{
  for(const language of ['en','ar']){
    expect(result(`verify-baseline-bad-${language}`).rows!.find(r=>r.id===`retained-${language}`)!.falseApproval).toBe(true);
    expect(result(`verify-candidate-bad-${language}`).rows!.every(r=>r.pass)).toBe(true);
    expect(result(`verify-candidate-good-${language}`).rows!.every(r=>r.pass)).toBe(true);
  }
});

it('replays paid verdicts and minimal repairs through the existing pipeline with source ownership intact',async()=>{
  const cases=fixture.cases.filter(c=>['retained-en','invented-agriculture-impact'].includes(c.id));
  const sourceRefs=new Set(cases.flatMap(c=>c.sources));
  const sources=fixture.sources.filter(s=>sourceRefs.has(s.ref));
  const {prepared}=prepareArticles(sources);
  const localRef=(ref:string)=>prepared.find(p=>p.id===sources.find(s=>s.ref===ref)!.id)!.ref;
  const repaired=JSON.parse(result('targeted-repair').response.text) as {items:Array<{body:string}>};
  // Only short source refs change mechanically when replaying a subset. No model is called.
  const mock=scripted({
    edit:[{items:cases.map(c=>({...c,sources:c.sources.map(localRef),importance:1}))}],
    verify:[JSON.parse(result('verify-candidate-bad-en').response.text),JSON.parse(result('targeted-recheck').response.text)],
    repair:[JSON.parse(result('targeted-repair').response.text)]
  });
  const actual=await generateBriefing({feed:FEED,windowStart:'2026-10-23T13:44:53.352Z',windowEnd:'2026-10-23T14:14:53.352Z',articles:sources},mock.port,MODELS);
  expect(actual.status).toBe('published');
  expect(actual.items.map(i=>i.body)).toEqual(repaired.items.map(i=>i.body));
  expect(actual.items.map(i=>i.sourceIds)).toEqual(cases.map(c=>c.sources.map(ref=>sources.find(s=>s.ref===ref)!.id)));
  expect(mock.calls.map(c=>c.stage)).toEqual(['edit','verify','repair','verify']);
});

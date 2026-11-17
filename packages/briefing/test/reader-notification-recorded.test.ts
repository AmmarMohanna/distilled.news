import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import evidence from '../../../benchmarks/results/v3-reader-notification/summary.json';
const run=(name:string)=>evidence.results.find(r=>r.name===name)!;
const output=(name:string)=>JSON.parse(run(name).response.text);

it('retains exact frozen requests and source bytes with ten settled calls under the amended ceiling',()=>{
 expect(evidence.totals).toMatchObject({calls:10,allSettled:true,outstanding:0});
 expect(evidence.totals.costUsd).toBeCloseTo(.0549796,8);
 expect(evidence.totals.reservedUsd).toBeLessThanOrEqual(.30);
 for(const r of evidence.results)expect(createHash('sha256').update(JSON.stringify(r.request)).digest('hex')).toBe(r.requestSha256);
 for(const input of Object.values(evidence.inputs))for(const a of input.articles)expect(createHash('sha256').update(a.text).digest('hex')).toBe(evidence.sourceHashes[a.url as keyof typeof evidence.sourceHashes]);
 for(const language of ['en','ar']){
  const baseline=run(`editor-baseline-${language}`),candidate=run(`editor-reader-focused-${language}`);
  expect({...candidate.request,messages:[baseline.request.messages[0],candidate.request.messages[1]]}).toEqual(baseline.request);
 }
});

it('records why shorter Arabic output and longer English output do not qualify the reader-focused prompt',()=>{
 expect(output('editor-baseline-ar').items).toHaveLength(4);
 expect(output('editor-reader-focused-ar').items).toHaveLength(2);
 expect(output('editor-baseline-ar').items.flatMap((i:{sources:string[]})=>i.sources)).toContain('S7');
 expect(output('editor-reader-focused-ar').items.flatMap((i:{sources:string[]})=>i.sources)).not.toContain('S7');
 expect(run('editor-reader-focused-en').readerWords).toBeGreaterThan(run('editor-baseline-en').readerWords!);
});

it('records optional-field omission and actual required-field notification failures rather than treating valid JSON as quality',()=>{
 for(const language of ['en','ar']){
  expect(output(`verify-notification-${language}`)).not.toHaveProperty('notification');
  expect(output(`verify-required-${language}`).notification.body.length).toBeLessThanOrEqual(160);
 }
 expect(output('verify-required-en').notification.body).toContain('imminent in Upper Galilee');
 expect(output('verify-required-en').results.find((r:{i:number})=>r.i===2).verdict).toBe('fix');
 expect(output('verify-baseline-en').results.find((r:{i:number})=>r.i===2).verdict).toBe('ok');
 expect(output('verify-required-ar').notification.body).toContain('عن المتخلفين عن الدفع');
 expect(output('verify-required-ar').notification.body).not.toContain('المؤسسات');
});

import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {scoreVerifierCases} from '../eval/factual-reliability';
import fixture from './fixtures/v3-factual-reliability.json';

const recorded=(name:string)=>JSON.parse(readFileSync(new URL(`../../../benchmarks/results/v3-factual-reliability/${name}.json`,import.meta.url),'utf8'));
describe('recorded real verifier outcomes (known semantic failures)',()=>{
  it.each(['baseline','revised','gpt41'])('%s falsely approves the three retained full bad outputs; redundant is not a factual diagnosis',variant=>{
    const run=recorded(variant+'-incorrect'),cases=fixture.cases.filter(c=>c.expected!=='ok');
    const scored=scoreVerifierCases(run.response,cases);
    expect(scored.falseApprovals).toBe(3);
    expect(scored.missedErrors).toBe(4);
    expect(scored.rows.filter(r=>r.detectedMaterialError)).toEqual([]);
    expect(scored.invalidOrMissing).toBe(0);
  });
  it.each(['incorrect','correct'])('changes only the model for the strong-verifier %s comparison',group=>{
    const mini=recorded('revised-'+group),strong=recorded('gpt41-'+group);
    expect({...strong.request,model:mini.request.model}).toEqual(mini.request);
    for(const source of fixture.sources)expect(mini.request.user).toContain(source.text);
  });
});

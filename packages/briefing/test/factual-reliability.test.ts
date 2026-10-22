import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import fixture from './fixtures/v3-factual-reliability.json';
import type {ModelRequest} from '../src/model';
import {generateBriefing} from '../src/engine';
import {prepareArticles} from '../src/prepare';
import {scoreVerifierCases} from '../eval/factual-reliability';
import {scripted,MODELS,FEED} from './helpers';

const articles=fixture.sources.map(s=>({id:s.id,source:s.source,title:s.title,url:s.url,publishedAt:s.publishedAt,text:s.text}));
const prepared=prepareArticles(articles).prepared;
const ref=(original:string)=>prepared.find(p=>p.id===fixture.sources.find(s=>s.ref===original)!.id)!.ref;
const item=(id:string)=>{const c=fixture.cases.find(c=>c.id===id)!;return {headline:c.headline,body:c.body,sources:c.sources.map(ref),relation:'new',importance:1}};
const input={feed:FEED,windowStart:fixture.windowStart,windowEnd:fixture.windowEnd,articles};

describe('retained factual-failure regressions (offline plumbing, not model qualification)',()=>{
  it('retains exact source bytes, distinct identities and labelled bad/good alternatives',()=>{
    expect(new Set(fixture.sources.map(s=>s.sha256)).size).toBe(3);
    for(const s of fixture.sources)expect(createHash('sha256').update(s.text).digest('hex')).toBe(s.sha256);
    expect(item('anthropic-retained-today').body).toContain('announced today');
    expect(item('replit-retained-timing').body).toContain('at TechCrunch Disrupt on October 16');
    expect(item('security-retained-scope').body).toContain('active exploitation of vulnerabilities, including');
    expect(fixture.cases.filter(c=>c.expected==='fix')).toHaveLength(4);
    expect(fixture.cases.filter(c=>c.expected==='ok').length).toBeGreaterThanOrEqual(7);
  });

  it('supplies reporting cutoff and metadata to verification without flagging a supported publication-date number',async()=>{
    const mock=scripted({edit:[{items:[item('anthropic-anchored')]}],verify:[(request:ModelRequest)=>{
      expect(request.user).toContain(`BRIEFING REPORTING CUTOFF: ${fixture.windowEnd}`);
      expect(request.user).toContain(fixture.sources[1].publishedAt);
      expect(request.user).not.toContain('numbers not found in cited sources: 18');
      return {results:[{i:0,verdict:'ok',issues:[]}]};
    }]});
    const result=await generateBriefing(input,mock.port,MODELS);
    expect(result.items[0].body).toContain('on October 18');
    expect(mock.calls).toHaveLength(2);
  });

  it('repairs a sparse subset with unchanged source owners, cutoff context and no new pipeline stage',async()=>{
    const mock=scripted({
      edit:[{items:[item('replit-concise-paraphrase'),item('anthropic-retained-today'),item('security-retained-scope')]}],
      verify:[{results:[{i:0,verdict:'ok',issues:[]},{i:1,verdict:'fix',issues:['source-relative date']},{i:2,verdict:'fix',issues:['predicate scope and actor attribution']}]},{results:[{i:0,verdict:'ok',issues:[]},{i:1,verdict:'ok',issues:[]}]}],
      repair:[(request:ModelRequest)=>{
        expect(request.user).toContain(`BRIEFING REPORTING CUTOFF: ${fixture.windowEnd}`);
        expect(request.user).toContain(`#0 [new] cites ${ref('S2')}`);
        expect(request.user).toContain(`#1 [new] cites ${ref('S3')}`);
        return {items:[{i:0,...item('anthropic-anchored'),drop:false},{i:1,...item('security-corrected-full'),drop:false}]};
      }]
    });
    const result=await generateBriefing(input,mock.port,MODELS);
    expect(result.items.map(i=>i.sourceIds)).toEqual(fixture.sources.map(s=>[s.id]));
    expect(result.items[1].body).toBe(item('anthropic-anchored').body);
    expect(result.items[2].body).toBe(item('security-corrected-full').body);
    expect(result.dropped).toEqual([]);
    expect(mock.calls.map(c=>c.stage)).toEqual(['edit','verify','repair','verify']);
  });

  it('matches V3 acceptance of an ok verdict with omitted empty issues',()=>{
    const result=scoreVerifierCases({text:'{"results":[{"i":0,"verdict":"ok"}]}'},[{id:'bad',expected:'fix'}]);
    expect(result).toMatchObject({falseApprovals:1,invalidOrMissing:0});
  });

  it('reports false approvals, false rejections and missing/duplicate verdicts separately',()=>{
    const cases=[{id:'bad',expected:'fix'},{id:'good',expected:'ok'},{id:'missing',expected:'ok'}];
    const score=scoreVerifierCases({text:JSON.stringify({results:[{i:0,verdict:'ok',issues:[]},{i:1,verdict:'fix',issues:['wrong']}]})},cases);
    expect(score).toMatchObject({falseApprovals:1,falseRejections:1,invalidOrMissing:1});
    const duplicate=scoreVerifierCases({text:JSON.stringify({results:[{i:0,verdict:'ok',issues:[]},{i:0,verdict:'ok',issues:[]}]})},cases.slice(0,1));
    expect(duplicate.invalidOrMissing).toBe(1);
  });
});

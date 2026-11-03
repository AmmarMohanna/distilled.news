import {it,expect} from 'vitest';import {readFileSync} from 'node:fs';
import {generateBriefing} from '../src/engine';import {prepareArticles} from '../src/prepare';import type {ModelPort} from '../src/model';
const read=(p:string)=>JSON.parse(readFileSync(new URL('../../../'+p,import.meta.url),'utf8'));
const corpus=read('benchmarks/editorial-distillation/corpus.json');const recorded=read('benchmarks/editorial-distillation/v6-results-2026-11-03.json');
it('locates post 107635 loss in the raw V6 editor output, not preprocessing or final parsing',async()=>{
 const c=corpus.cases.find((c:any)=>c.id==='lebanon-roundup-ar'),input={feed:c.feed,windowStart:c.windowStart,windowEnd:c.windowEnd,prior:c.prior,articles:c.articleIds.map((id:string)=>corpus.sources.find((s:any)=>s.article.id===id).article)};
 const target=input.articles.find((a:any)=>a.url.endsWith('/107635'));expect(target).toBeDefined();const {prepared,skipped}=prepareArticles(input.articles);const source=prepared.find(s=>s.id===target.id)!;expect(source.ref).toBe('S13');expect(skipped).toEqual([]);
 const calls=recorded.records.filter((r:any)=>r.label==='lebanon-roundup-ar-v6');expect(calls.map((r:any)=>r.stage)).toEqual(['editor','verify']);expect(calls[0].request.user).toContain(source.text);
 const raw=JSON.parse(calls[0].response.text);expect(raw.items).toHaveLength(3);expect(raw.items.flatMap((i:any)=>i.sources)).not.toContain('S13');expect(raw.left_out.flatMap((i:any)=>i.sources)).not.toContain('S13');expect(calls[1].response.text).toContain('"verdict":"ok"');
 let n=0;const port:ModelPort={async complete(request){const original=calls[n++];if(!original)throw Error('UNEXPECTED_CALL_NO_NETWORK');expect(request).toEqual(original.request);return original.response;}};
 const result=await generateBriefing(input,port,{editor:'openai/gpt-4.1',verifier:'openai/gpt-4.1-mini'},{promptVersion:6,maxRepairs:1,now:()=>new Date(input.windowEnd)});
 expect(n).toBe(2);const final=recorded.runs.find((r:any)=>r.label==='lebanon-roundup-ar-v6').result;expect(result.items).toEqual(final.items);expect(result.skipped).toEqual([]);expect(result.dropped).toEqual([]);expect(result.omitted.flatMap(x=>x.sourceIds)).not.toContain(target.id);expect(result.items.flatMap(x=>x.sourceIds)).not.toContain(target.id);expect(result.unaccounted).toContainEqual({ref:'S13',sourceIds:[target.id]});
});
it('ties the fund quantity and timing concerns to exact retained primary evidence and accepted text',()=>{
 const source=corpus.sources.find((s:any)=>s.article.id==='public-benefit-fund').article.text;
 expect(source).toContain('Subject to stockholder approval, 5%');expect(source).toContain('roughly 20% of Anthropic shares will be dedicated');
 const v4=recorded.runs.find((r:any)=>r.label==='ai-multisource-en-v4').result.items.find((i:any)=>i.sourceIds.includes('public-benefit-fund'));
 const v6=recorded.runs.find((r:any)=>r.label==='ai-multisource-en-v6').result.items.find((i:any)=>i.sourceIds.includes('public-benefit-fund'));
 expect(v4.body).toContain('are now dedicated');expect(v6.headline).toContain('up to 5%');expect(v6.body).toContain('subject to stockholder approval');
 for(const version of [4,6]){const verify=recorded.records.find((r:any)=>r.label===`ai-multisource-en-v${version}`&&r.stage==='verify');expect(JSON.parse(verify.response.text).results.every((r:any)=>r.verdict==='ok')).toBe(true);}
});

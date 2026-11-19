import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {article,FEED,MODELS,WINDOW} from './helpers';
const input={feed:FEED,...WINDOW,articles:[article('a','The council approved a new emergency flood fund.'),article('b','The sports club won an exhibition match.')]};
const item={headline:'Council approves emergency flood fund',body:'',sources:['S1'],relation:'new',updates:null,importance:2};
const options={promptVersion:4 as const,editorAccountingPolicy:'complete-source-decisions-v3' as any,editorFailurePolicy:'isolate-unaccounted-sources-v2' as const,prepare:{nearDuplicate:1.01}};
function model(decisions:any,items:any[]=[item]){const requests:any[]=[];return {requests,complete:async(q:any)=>{requests.push(q);return {text:JSON.stringify(q.system.startsWith('You are the editor')?{items,source_decisions:decisions}:{results:[{i:0,verdict:'ok',issues:[]}]}),inputTokens:1,outputTokens:1}}};}
it('requires every supplied source key without another model stage and preserves exclusions separately',async()=>{
 const p=model({S1:{decision:'selected',why:'New emergency decision.'},S2:{decision:'excluded',why:'Off-topic sport.'}}),result=await generateBriefing(input,p,MODELS,options);
 expect(result.items[0].sourceIds).toEqual(['a']);expect(result.omitted[0]).toMatchObject({sourceIds:['b'],reason:'Off-topic sport.'});expect(result.unaccounted).toEqual([]);
 const schema=p.requests[0].responseSchema;expect(schema.properties.source_decisions.required).toEqual(['S1','S2']);expect(p.requests.filter(q=>q.system.startsWith('You are the editor'))).toHaveLength(1);
});
it('rejects contradictory selections and fabricated or missing source decisions without false quiet',async()=>{
 for(const decisions of [{S1:{decision:'excluded',why:'Routine.'},S2:{decision:'excluded',why:'Sport.'}},{S1:{decision:'selected',why:'New.'},S99:{decision:'excluded',why:'Other.'}}]){
  const p=model(decisions),r=await generateBriefing(input,p,MODELS,options);expect(r.status).toBe('rejected');expect(r.items).toEqual([]);expect(r.dropped[0]).toMatchObject({carry:true,sourceIds:['a','b'],reason:expect.stringContaining('STRUCTURED_EDITOR_ACCOUNTING')});expect(p.requests).toHaveLength(2);
 }
});
it('retains valid siblings and carries only missing keys if a provider violates the required-key schema',async()=>{
 const p=model({S1:{decision:'selected',why:'New emergency decision.'}}),r=await generateBriefing(input,p,MODELS,options);
 expect(r.status).toBe('published');expect(r.items[0].sourceIds).toEqual(['a']);expect(r.unaccounted).toEqual([{ref:'S2',sourceIds:['b']}]);expect(r.dropped[0]).toMatchObject({carry:true,sourceIds:['b']});
});
it('permits a fully accounted quiet window without inventing selections',async()=>{
 const p=model({S1:{decision:'excluded',why:'Previously communicated fund; no changed decision.'},S2:{decision:'excluded',why:'Off-topic sport.'}},[]),r=await generateBriefing(input,p,MODELS,options);
 expect(r.status).toBe('empty');expect(r.omitted).toHaveLength(2);expect(r.unaccounted).toEqual([]);expect(p.requests).toHaveLength(1);
});
it('preserves the existing malformed-draft failure instead of disguising it as missing bookkeeping',async()=>{
 const p=model(undefined,[{...item,headline:''}]);await expect(generateBriefing(input,p,MODELS,options)).rejects.toThrow('INVALID_ARTICLE_HEADLINE');expect(p.requests).toHaveLength(2);
});

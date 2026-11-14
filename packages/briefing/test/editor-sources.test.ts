import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {article,FEED,MODELS,WINDOW} from './helpers';
import {prepareArticles} from '../src/prepare';
const articles=[article('a','The cabinet approved a new airport terminal. Construction starts in June.'),article('b','Another outlet reports cabinet approval of the airport terminal, with work starting in June.'),article('c','The cabinet is considering a different railway station proposal.')];
const options={editorSourcePolicy:'all-supporting-sources-v1' as const,editorAccountingPolicy:'complete-source-decisions-v2' as const,prepare:{nearDuplicate:1.01}};
const prepared=prepareArticles(articles,options.prepare).prepared,ref=(id:string)=>prepared.find(a=>a.id===id)!.ref;
it('selects one story with every supporting outlet without a second full-input source audit',async()=>{
 const calls:string[]=[];
 const port={complete:async(request:any)=>{
  calls.push(request.system);
  if(request.system.startsWith('You are the editor')){
   expect(request.user).toContain('ALL SUPPORTING SOURCES');
   return {text:JSON.stringify({items:[{headline:'Cabinet approves airport terminal',body:'Construction starts in June.',sources:[ref('a'),ref('b')],relation:'new',updates:null,importance:1}],left_out:[{sources:[ref('c')],why:'off-topic'}]}),inputTokens:1,outputTokens:1};
  }
  expect(request.system).toContain('meticulous fact-checker');expect(request.user).toContain('EACH cited source');
  return {text:'{"results":[{"i":0,"verdict":"ok","issues":[]}]}',inputTokens:1,outputTokens:1};
 }};
 const r=await generateBriefing({feed:FEED,...WINDOW,articles},port,MODELS,options);
 expect(r.items).toHaveLength(1);expect(r.items[0].sourceIds.sort()).toEqual(['a','b']);expect(calls).toHaveLength(2);expect(r.unaccounted).toEqual([]);
});
it('retains all citations across independently edited chunks',async()=>{
 const calls:string[]=[];
 const port={complete:async(q:any)=>{calls.push(q.system);let result:any;
  if(q.system.startsWith('You are the editor')){
   expect(q.user).toContain('PARTIAL CHUNK: Another chunk may contain the fuller report');
   const refs=[...q.user.matchAll(/\[(S\d+)\]/g)].map(m=>m[1]),known=[...new Set(refs)];
   result=known.includes(ref('c'))?{items:[],left_out:[{sources:[ref('c')],why:'off-topic'}]}:{items:[{headline:'Cabinet approves airport terminal',body:'Construction starts in June.',sources:known,relation:'new',updates:null,importance:1}],left_out:[]};
  }else if(q.system.startsWith('You are the senior editor')){expect(q.user).toContain('every draft supporting the same development');result={items:[{from:[0,1],headline:'Cabinet approves airport terminal',body:'Construction starts in June.',relation:'new',updates:null,importance:1}],cut:[]};}
  else result={results:[{i:0,verdict:'ok',issues:[]}]};
  return{text:JSON.stringify(result),inputTokens:1,outputTokens:1};
 }};
 const r=await generateBriefing({feed:FEED,...WINDOW,articles},port,MODELS,{...options,maxEditorChars:1});
 expect(r.items).toHaveLength(1);expect(r.items[0].sourceIds.sort()).toEqual(['a','b']);expect(calls.some(c=>c.startsWith('You audit source coverage'))).toBe(false);
});
it('does not publish when verification finds unrelated citations',async()=>{
 const port={complete:async(q:any)=>({text:JSON.stringify(q.system.startsWith('You are the editor')?{items:[{headline:'Cabinet approves airport terminal',body:'',sources:prepared.map(a=>a.ref),relation:'new',updates:null,importance:1}],left_out:[]}:{results:[{i:0,verdict:'drop',issues:['Railway proposal is a different development.']}]}),inputTokens:1,outputTokens:1})};
 const r=await generateBriefing({feed:FEED,...WINDOW,articles},port,MODELS,options);expect(r.items).toEqual([]);expect(r.status).toBe('rejected');
});
it('leaves the old citation audit active for frozen legacy inputs',async()=>{
 let audits=0;const port={complete:async(q:any)=>{let r:any;if(q.system.startsWith('You audit source coverage')){audits++;r={sources:JSON.parse(q.user).sources.map((a:any)=>({ref:a.ref,stories:a.ref===ref('c')?[]:[0]}))};}else if(q.system.startsWith('You are the editor'))r={items:[{headline:'Cabinet approves airport terminal',body:'',sources:[ref('a')],relation:'new',updates:null,importance:1}]};else r={results:[{i:0,verdict:'ok',issues:[]}]};return{text:JSON.stringify(r),inputTokens:1,outputTokens:1}}};
 const r=await generateBriefing({feed:FEED,...WINDOW,articles},port,MODELS,{citationCoverage:true,prepare:{nearDuplicate:1.01}});expect(audits).toBe(1);expect(r.items[0].sourceIds.sort()).toEqual(['a','b']);
});

it('retains every selected outlet through a targeted repair and recheck',async()=>{
 let verifies=0;const stages:string[]=[];
 const port={complete:async(q:any)=>{stages.push(q.system);let r:any;
 if(q.system.startsWith('You are the editor'))r={items:[{headline:'Cabinet approves airport terminal',body:'Work starts immediately.',sources:[ref('a'),ref('b')],relation:'new',updates:null,importance:1}],left_out:[{sources:[ref('c')],why:'off-topic'}]};
 else if(q.system.includes('meticulous fact-checker'))r={results:[{i:0,verdict:verifies++?'ok':'fix',issues:verifies===1?['The sources say construction starts in June.']:[]}]};
 else r={items:[{i:0,headline:'Cabinet approves airport terminal',body:'Construction starts in June.'}]};
 return{text:JSON.stringify(r),inputTokens:1,outputTokens:1};}};
 const result=await generateBriefing({feed:FEED,...WINDOW,articles},port,MODELS,options);expect(result.items[0].sourceIds.sort()).toEqual(['a','b']);expect(verifies).toBe(2);expect(stages.some(s=>s.startsWith('You audit source coverage'))).toBe(false);
});
it('refuses contradictory citation workflows rather than silently dropping frozen audit behavior',async()=>{
 await expect(generateBriefing({feed:FEED,...WINDOW,articles},{complete:async()=>{throw Error('should not call')}},MODELS,{...options,citationCoverage:true})).rejects.toThrow('CONFLICTING_SOURCE_POLICIES');
});

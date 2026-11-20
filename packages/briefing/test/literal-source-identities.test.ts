import {expect,it} from 'vitest';
import {literalIdentitySurface,verifySourceBoundClaims} from '../src/source-bound-claims';
import {UsageMeter,type ModelPort,type ModelRequest} from '../src/model';
import {BriefingModelError} from '../src/types';

it.each([
 ['أعلن الرئيس عبد الفتاح السيسي القرار.','عبد الفتاح السيسي'],
 ['President Jane Doe approved.','Jane Doe'],
 ['Le président Jean-Baptiste de La Tour répond.','Jean-Baptiste de La Tour'],
 ['Dr. Jane Doe spoke.','Dr.'],
])('binds exact complete source tokens: %s',(text,span)=>expect(literalIdentitySurface(text,span)).toBe(span));
it.each([
 ['Johnstown approved.','John'],['Jane-Smith spoke.','Jane'],['أعلن الرئيس السيسي القرار.','الوحش'],['A factual source.','invented'],
])('rejects invented or partial-token identity surfaces: %s',(text,span)=>expect(()=>literalIdentitySurface(text,span)).toThrow('UNBOUND_LITERAL_IDENTITY'));
it('allows an explicitly absent role but rejects a blank person',()=>{
 expect(literalIdentitySurface('Jane Doe spoke.','',true)).toBe('');
 expect(()=>literalIdentitySurface('Jane Doe spoke.','')).toThrow();
});
it('keeps rejecting detached names and gives exact source-token hints only under the new contract',()=>{
 expect(()=>literalIdentitySurface('بوتين وروبيو.','روبيو')).toThrow('UNBOUND_LITERAL_IDENTITY');
 expect(()=>literalIdentitySurface('بوتين وروبيو.','روبيو',false,true)).toThrow('وروبيو');
 expect(literalIdentitySurface('بوتين وروبيو.','وروبيو',false,true)).toBe('وروبيو');
 expect(()=>literalIdentitySurface('Johnstown spoke.','John',false,true)).toThrow('Johnstown');
 expect(()=>literalIdentitySurface('Source mentions سلام.','نجيب سلام',false,true)).toThrow('UNBOUND_LITERAL_IDENTITY');
});

it('does not swallow uncertain provider failures in the new source-only stage',async()=>{
 const failure=new BriefingModelError('response body missing',false,true),port:ModelPort={complete:async q=>{
  if(q.system.startsWith('Independently extract'))throw failure;
  return {text:JSON.stringify({units:{'I0.H':[]},assertions:{'I0.H':[{tokens:{start:'T0',end:'T0'},kind:'action'}]}}),inputTokens:1,outputTokens:1};
 }};
 await expect(verifySourceBoundClaims(port,new UsageMeter(),{model:'openai/gpt-4.1',sourceInventoryPolicy:'literal-v1',language:'en',items:[{headline:'Approved.',body:'',refs:['S1']}],sources:[{ref:'S1',text:'Approved.'}],prior:[],independentSourceBindings:true,atomicReaderAssertions:true})).rejects.toBe(failure);
});

it('routes only indexed source extraction to mini without changing its established wire contract',async()=>{
 const traces:ModelRequest[]=[];let count=0;
 const port:ModelPort={complete:async q=>{traces.push(q);count++;const p=JSON.parse(q.user);
  const value=count===1?{units:{'I0.H':[]},assertions:{'I0.H':[{tokens:{start:'T0',end:'T0'},kind:'action'}]}}:count===2?{sources:{S1:[]}}:{results:{'0':{inventory:'complete',verdict:'ok',issues:[],priorIds:[],citationChecks:{S1:{support:'supported',quote:p.evidencePassages[0].id,explanation:'Same event.'}},facets:Object.fromEntries(p.inventory.map((f:any)=>[f.id,{support:'supported',evidence:[{source:'S1',quote:p.evidencePassages[0].id}],explanation:'Supported.'}]))}}};
  return {text:JSON.stringify(value),inputTokens:1,outputTokens:1};
 }};
 await verifySourceBoundClaims(port,new UsageMeter(),{model:'openai/gpt-4.1',sourceInventoryPolicy:'indexed-mini-v1',language:'en',items:[{headline:'Approved.',body:'',refs:['S1']}],sources:[{ref:'S1',text:'Approved.'}],prior:[],independentSourceBindings:true,atomicReaderAssertions:true});
 expect(traces.map(q=>q.model)).toEqual(['openai/gpt-4.1','openai/gpt-4.1-mini','openai/gpt-4.1']);
 expect(JSON.parse(traces[1].user)).toEqual({units:[{id:'S1',indexedText:'\n[T0]Approved.'}]});
 expect(traces[1].system).not.toContain('personText');
});

it.each(['literal-v1','literal-mini-v1'] as const)('keeps source-only extraction blind and factual verification strong under %s',async policy=>{
 const requests:ModelRequest[]=[];const port:ModelPort={complete:async q=>{
  requests.push(q);const p=JSON.parse(q.user);let value;
  if(q.system.startsWith('Independently identify'))value={units:{'I0.H':[{personTokens:{start:'T1',end:'T2'},roleTokens:{start:'T0',end:'T0'}}]},assertions:{'I0.H':[{tokens:{start:'T0',end:'T3'},kind:'action'}]}};
  else if(q.system.startsWith('Independently extract')){expect(p).not.toHaveProperty('items');expect(p).not.toHaveProperty('prior');expect(p.units[0]).toEqual({id:'S1',text:'\nPresident Jane Doe approved.'});value={sources:{S1:[{personText:'Jane Doe',roleText:'President'}]}};}
  else{expect(p.sourceIdentities).toEqual([{source:'S1',name:'Jane Doe',role:'President'}]);value={results:{'0':{inventory:'complete',verdict:'ok',issues:[],priorIds:[],citationChecks:{S1:{support:'supported',quote:p.evidencePassages[0].id,explanation:'Same event.'}},facets:Object.fromEntries(p.inventory.map((f:any)=>[f.id,{support:'supported',evidence:[{source:'S1',quote:p.evidencePassages[0].id}],explanation:'Supported against complete source.'}]))}}};}
  return {text:JSON.stringify(value),inputTokens:10,outputTokens:10};
 }};
 const result=await verifySourceBoundClaims(port,new UsageMeter(),{model:'openai/gpt-4.1',sourceInventoryPolicy:policy,language:'en',items:[{headline:'President Jane Doe approved.',body:'',refs:['S1']}],sources:[{ref:'S1',text:'President Jane Doe approved.'}],prior:[],independentSourceBindings:true,atomicReaderAssertions:true});
 expect(result.get(0)?.verdict).toBe('ok');expect(requests.map(r=>r.model)).toEqual(['openai/gpt-4.1',policy==='literal-mini-v1'?'openai/gpt-4.1-mini':'openai/gpt-4.1','openai/gpt-4.1']);
});

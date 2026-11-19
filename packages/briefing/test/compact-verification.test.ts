import {expect,it} from 'vitest';
import {compactVerificationInventory,bindingReviewUser,verifySourceBoundClaims} from '../src/source-bound-claims';
import {UsageMeter,type ModelRequest,type ModelPort} from '../src/model';

it.each([
 ['en','President Jane Doe approved the €15 million plan.'],
 ['ar','أعلن الرئيس عبد الفتاح السيسي تخصيص ١٥ مليون دولار.'],
 ['fr','La présidente a annoncé une aide estimée à 15 millions d’euros.'],
])('preserves every factual field and exact reader context in %s',(_language,text)=>{
 const items=[{headline:text,body:text+'\nA distinct second sentence.',refs:['S1','S2']}];
 const facets=Array.from({length:12},(_,i)=>({id:`F${i}`,unit:'I0.B',item:0,quote:i%2?text:'15',claim:items[0].body,kind:i%2?'action':'quantity',personName:'Jane Doe',roleSurface:'President'}));
 const original=JSON.stringify(facets),wire=compactVerificationInventory(items,facets);
 expect(wire.every(f=>!('claim' in f)&&f.claimUnit==='I0.B')).toBe(true);
 const reconstructed=wire.map(({claimUnit,...f})=>({...f,claim:claimUnit?items[f.item].body:f.claim}));
 expect(reconstructed).toEqual(facets);
 expect(JSON.stringify(wire).length).toBeLessThan(original.length);
 expect(JSON.stringify(facets)).toBe(original);
});

it('retains literal claims when context is different, missing, or associated with another item',()=>{
 const items=[{headline:'Actual headline.',body:'Actual body.',refs:['S1']},{headline:'Other.',body:'Other body.',refs:['S2']}];
 const facets=[
  {id:'a',unit:'I0.H',item:0,quote:'Actual',claim:'A distinct atomic interpretation.',kind:'other'},
  {id:'b',unit:'I99.B',item:0,quote:'Actual',claim:'Actual body.',kind:'other'},
  {id:'c',unit:'I1.B',item:0,quote:'Other',claim:'Other body.',kind:'other'},
 ];
 expect(compactVerificationInventory(items,facets)).toEqual(facets);
 const packet={language:'en',items,inventory:facets,prior:[],context:'original',sources:[{ref:'S1',text:'Complete source.'}]};
 expect(bindingReviewUser(packet)).toBe(JSON.stringify(packet));
});

it.each(['supported','uncertain','contradicted'])('changes only redundant request context and preserves %s decisions',async support=>{
 const items=[{headline:'The bridge opened.',body:'It opened on Monday.',refs:['S1']}];
 async function run(compact:boolean){
  const requests:ModelRequest[]=[];
  const port:ModelPort={complete:async request=>{
   requests.push(request);const p=JSON.parse(request.user);
   const value=p.units?{units:Object.fromEntries(p.units.map((u:any)=>[u.id,[]])),assertions:Object.fromEntries(p.units.map((u:any)=>[u.id,[{tokens:{start:'T0',end:'T1'},kind:'action'}]]))}:
    request.system.startsWith('Independently extract')?{sources:{S1:[]}}:
    {results:{'0':{inventory:'complete',verdict:support==='supported'?'ok':'fix',issues:support==='supported'?[]:['Needs factual repair.'],priorIds:[],citationChecks:{S1:{support:'supported',quote:p.evidencePassages[0].id,explanation:'Same development.'}},facets:Object.fromEntries(p.inventory.map((f:any)=>[f.id,{support,evidence:support==='uncertain'?[]:[{source:'S1',quote:p.evidencePassages[0].id}],explanation:'Retained source judgment.'}]))}}};
   // Source extraction also has units, but is blind to reader assertions.
   const content=request.system.startsWith('Independently extract')?{sources:{S1:[]}}:value;
   return {text:JSON.stringify(content),inputTokens:1,outputTokens:1};
  }};
  const result=await verifySourceBoundClaims(port,new UsageMeter(),{model:'m',language:'en',items,sources:[{ref:'S1',text:'The bridge opened on Monday.'}],prior:[],independentSourceBindings:true,atomicReaderAssertions:true,...(compact?{verificationInputPolicy:'reader-unit-context-v1' as const}:{})});
  return {requests,result};
 }
 const old=await run(false),next=await run(true);
 expect(next.result).toEqual(old.result);expect(next.result.get(0)?.verdict).toBe(support==='supported'?'ok':'fix');
 expect(next.requests).toHaveLength(3);expect(next.requests.slice(0,2)).toEqual(old.requests.slice(0,2));
 const a=old.requests[2],b=next.requests[2];
 expect(b.responseSchema).toEqual(a.responseSchema);expect(b.maxTokens).toBe(a.maxTokens);
 const before=JSON.parse(a.user),after=JSON.parse(b.user);
 expect({...after,inventory:before.inventory}).toEqual(before);
 expect(after.inventory.every((f:any)=>f.claimUnit===f.unit&&!('claim' in f))).toBe(true);
 expect(a.system).not.toContain('claimUnit');expect(b.system).toContain('claimUnit');
});

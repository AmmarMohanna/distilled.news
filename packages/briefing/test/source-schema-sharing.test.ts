import {expect,it} from 'vitest';
import {verifySourceBoundClaims} from '../src/source-bound-claims';
import {UsageMeter,type ModelRequest} from '../src/model';
it('shares only source schemas without changing reader/final requests or judgments',async()=>{
 const runs:ModelRequest[][]=[];const results=[];
 for(const sourceSchemaSharing of [false,true]){const requests:ModelRequest[]=[];runs.push(requests);let n=0;results.push(await verifySourceBoundClaims({complete:async q=>{requests.push(q);n++;const p=JSON.parse(q.user);const value=n===1?{units:{'I0.H':[]},assertions:{'I0.H':[{tokens:{start:'T0',end:'T0'},kind:'action'}]}}:n===2?{sources:{S1:[]}}:{results:{'0':{inventory:'complete',verdict:'ok',issues:[],priorIds:[],citationChecks:{S1:{support:'supported',quote:p.evidencePassages[0].id,explanation:'Supported.'}},facets:Object.fromEntries(p.inventory.map((f:any)=>[f.id,{support:'supported',evidence:[{source:'S1',quote:p.evidencePassages[0].id}],explanation:'Supported.'}]))}}};return {text:JSON.stringify(value),inputTokens:1,outputTokens:1}}},new UsageMeter(),{model:'openai/gpt-4.1',sourceSchemaSharing,language:'en',items:[{headline:'Approved.',body:'',refs:['S1']}],sources:[{ref:'S1',text:'Approved. '+Array.from({length:50},(_,i)=>'word'+i).join(' ')}],prior:[],independentSourceBindings:true,atomicReaderAssertions:true} as any));}
 expect(results[1]).toEqual(results[0]);expect(runs[1][0]).toEqual(runs[0][0]);expect(runs[1][2]).toEqual(runs[0][2]);
 expect({...runs[1][1],responseSchema:undefined}).toEqual({...runs[0][1],responseSchema:undefined});expect(JSON.stringify(runs[1][1].responseSchema).length).toBeLessThan(JSON.stringify(runs[0][1].responseSchema).length);
});

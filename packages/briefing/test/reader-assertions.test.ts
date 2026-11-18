import {expect,it} from 'vitest';
import {decodeInventory,inventorySchema,verifySourceBoundClaims,READER_BINDINGS_SYSTEM} from '../src/source-bound-claims';
import {UsageMeter,type ModelPort} from '../src/model';
it('keeps the frozen v2 reader prompt unchanged',async()=>{
 const port:ModelPort={complete:async request=>{expect(request.system).toBe(READER_BINDINGS_SYSTEM);throw Error('STOP_WITHOUT_PROVIDER')}};
 await expect(verifySourceBoundClaims(port,new UsageMeter(),{model:'m',language:'fr',items:[{headline:'Une bibliothèque ouvre.',body:'',refs:['S1']}],sources:[],prior:[],independentSourceBindings:true})).rejects.toThrow('STOP_WITHOUT_PROVIDER');
});

it.each([
 ['fr','Les critiques sont unanimement positives.','T3','unanimement'],
 ['en','The proposal may open every hospital.','T2','may'],
 ['ar','أيد جميع النواب الاقتراح.','T1','جميع'],
])('binds an independent %s qualification to exact reader tokens without losing full-text checks',(language,headline,token,quote)=>{
 const items=[{headline,body:'',refs:['S1']}];
 const facets=decodeInventory({units:{'I0.H':[]},assertions:{'I0.H':[{tokens:{start:token,end:token},kind:'uncertainty'}]}},items,true);
 expect(facets.find(f=>f.id==='ASSERTION_I0.H_0')).toMatchObject({quote,kind:'uncertainty',claim:headline});
 expect(facets.find(f=>f.id==='FULL_READER_I0.H')?.quote).toBe(headline);
 expect((inventorySchema(items,true) as any).required).toContain('assertions');
});

it('rejects missing, empty and fabricated atomic-assertion spans rather than silently reverting to a whole-headline approval',()=>{
 const items=[{headline:'Reviews are overwhelmingly positive.',body:'',refs:['S1']}];
 expect(()=>decodeInventory({units:{'I0.H':[]}},items,true)).toThrow('MISSING_READER_ASSERTIONS');
 expect(()=>decodeInventory({units:{'I0.H':[]},assertions:{'I0.H':[]}},items,true)).toThrow('EMPTY_READER_ASSERTIONS');
 expect(()=>decodeInventory({units:{'I0.H':[]},assertions:{'I0.H':[{tokens:{start:'T0',end:'T99'},kind:'action'}]}},items,true)).toThrow('INVALID_READER_TOKEN_SPAN');
});

it('checks qualification support separately even when the whole headline was initially approved',async()=>{
 const items=[{headline:'Les critiques sont unanimement positives.',body:'',refs:['S1']}];let calls=0;
 const port:ModelPort={complete:async request=>{
  calls++;const p=JSON.parse(request.user);let raw:unknown;
  if(calls===1){expect(p).not.toHaveProperty('sources');expect((request.responseSchema as any).required).toContain('assertions');raw={units:{'I0.H':[]},assertions:{'I0.H':[{tokens:{start:'T3',end:'T3'},kind:'uncertainty'}]}};}
  else if(calls===2)raw={sources:{S1:[]}};
  else raw={results:{'0':{inventory:'complete',verdict:'fix',issues:['unanimement -> source says overwhelmingly, not all critics'],priorIds:[],citationChecks:{S1:{support:'supported',quote:p.evidencePassages[0].id,explanation:'Same reviews.'}},facets:Object.fromEntries(p.inventory.map((f:any)=>[f.id,{support:f.id.startsWith('ASSERTION_')?'unsupported':'supported',evidence:[{source:'S1',quote:p.evidencePassages[0].id}],explanation:f.id.startsWith('ASSERTION_')?'The source does not establish universal agreement.':'The same game has positive reviews.'}]))}}};
  return {text:JSON.stringify(raw),inputTokens:1,outputTokens:1};
 }};
 const out=await verifySourceBoundClaims(port,new UsageMeter(),{model:'existing',language:'fr',items,sources:[{ref:'S1',text:'Reviewers overwhelmingly agreed the game was worth the wait.'}],prior:[],independentSourceBindings:true,atomicReaderAssertions:true});
 expect(calls).toBe(3);expect(out.get(0)?.verdict).toBe('fix');
});

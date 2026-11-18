import {expect,it} from 'vitest';
import {readerUnits,parseReaderInventory,parseBoundReview,verifySourceBoundClaims} from '../src/source-bound-claims';
import {UsageMeter,type ModelPort} from '../src/model';
import {generateBriefing} from '../src/engine';
import {article,FEED,MODELS,WINDOW} from './helpers';
const items=[{headline:'الرئيس عبد الفتاح الوحش أعلن القرار.',body:'',refs:['S1']}];
const sources=[{ref:'S1',text:'أعلن الرئيس عبد الفتاح السيسي القرار.'}];
const inventory=(rows=items)=>({units:readerUnits(rows).map(u=>({id:u.id,facets:[{id:u.id+'-F1',quote:u.text,claim:u.text,kind:'identity'}]}))});
const review=(support='supported',verdict='ok')=>({results:[{i:0,inventory:'complete',verdict,issues:[] as string[],facets:[{id:'I0.H-F1',support,evidence:[{source:'S1',quote:sources[0].text}],explanation:'Compared identity with source.'}]}]});
it('requires every character of headline AND body to be inventoried, not just an extracted gist',()=>{
 const rows=[{...items[0],body:'The cost is $15 million.'}];
 expect(()=>parseReaderInventory(inventory(),rows)).toThrow('MISSING_READER_UNIT');
 const raw=inventory();raw.units[0].facets[0].quote='أعلن القرار.';
 expect(()=>parseReaderInventory(raw,items)).toThrow('UNINVENTORIED_READER_TEXT');
});
it('allows overlapping semantic facets for identities, quantities, dates and negation without a language-specific boundary parser',()=>{
 const rows=[{headline:'Former president Jean-Baptiste de La Tour did not approve €15 million on Monday.',body:'',refs:['S1']}];
 const raw={units:[{id:'I0.H',facets:[{id:'all',quote:rows[0].headline,claim:'The stated event was not approved, with the stated actor and amount.',kind:'action'},...[
  ['person','Jean-Baptiste de La Tour','identity'],['office','Former president','role'],['negative','did not approve','uncertainty'],['sum','€15 million','quantity'],['date','Monday','time']
 ].map(([id,quote,kind])=>({id,quote,claim:quote,kind}))]}]};
 const facets=parseReaderInventory(raw,rows);expect(facets).toHaveLength(6);
 const result={results:[{i:0,inventory:'complete',verdict:'fix',issues:[],facets:facets.map(f=>({id:f.id,support:f.id==='sum'?'contradicted':'supported',evidence:[{source:'S1',quote:'The proposal was for €5 million.'}],explanation:'The amount differs; the real judgment is the model responsibility.'}))}]};
 expect(parseBoundReview(result,rows,[{ref:'S1',text:'The proposal was for €5 million.'}],facets).get(0)?.issues.join(' ')).toContain('€15 million');
});
it('accepts source-grounded translations/paraphrases without demanding names or wording match lexically',()=>{
 const translated=[{headline:'أعلن الرئيس القرار.',body:'',refs:['S1']}],ledger=parseReaderInventory(inventory(translated),translated),raw=review();raw.results[0].facets[0].evidence[0].quote='The president announced the decision.';
 expect(parseBoundReview(raw,translated,[{ref:'S1',text:'The president announced the decision.'}],ledger).get(0)?.verdict).toBe('ok');
 // This is a contract test only: quote provenance does NOT independently prove
 // that the supplied model judgment is correct about this translated identity.
});
it('rejects invented reader spans, duplicate IDs, missing or duplicate unit rows',()=>{
 const a=inventory();a.units[0].facets[0].quote='fabricated';expect(()=>parseReaderInventory(a,items)).toThrow('UNBOUND_READER_QUOTE');
 const b=inventory();b.units[0].facets.push({...b.units[0].facets[0]});expect(()=>parseReaderInventory(b,items)).toThrow('DUPLICATE_FACET');
 const c=inventory();c.units.push(c.units[0]);expect(()=>parseReaderInventory(c,items)).toThrow('DUPLICATE_READER_UNIT');
});
it.each(['contradicted','unsupported','uncertain'])('cannot approve a %s facet despite a top-level ok',support=>{
 expect(()=>parseBoundReview(review(support),items,sources,parseReaderInventory(inventory(),items))).toThrow('BINDING_VERDICT_CONTRADICTION');
});
it('requires every item/facet once and proof from the item citation, not a sibling citation',()=>{
 const ledger=parseReaderInventory(inventory(),items),raw=review();raw.results[0].facets=[];
 expect(()=>parseBoundReview(raw,items,sources,ledger)).toThrow('MISSING_FACET_ASSESSMENT');
 const other=review();other.results[0].facets[0].evidence[0].source='S2';
 expect(()=>parseBoundReview(other,items,[...sources,{ref:'S2',text:sources[0].text}],ledger)).toThrow('UNATTACHED_BINDING_SOURCE');
 const invented=review();invented.results[0].facets[0].evidence[0].quote='a made-up quote';
 expect(()=>parseBoundReview(invented,items,sources,ledger)).toThrow('UNBOUND_SOURCE_QUOTE');
});
it('cannot approve an additional attached citation that was never checked in facet evidence',()=>{
 const extra=[{...items[0],refs:['S1','S2']}],ledger=parseReaderInventory(inventory(extra),extra);
 expect(()=>parseBoundReview(review(),extra,[...sources,{ref:'S2',text:'An unrelated event.'}],ledger)).toThrow('UNCHECKED_ITEM_CITATION');
});
it('keeps incomplete or uncertain inventories out of publication approval',()=>{
 const ledger=parseReaderInventory(inventory(),items);
 for(const state of ['incomplete','uncertain']){const raw=review();raw.results[0].inventory=state;expect(()=>parseBoundReview(raw,items,sources,ledger)).toThrow('BINDING_VERDICT_CONTRADICTION');raw.results[0].verdict='fix';raw.results[0].issues=['The identity facet needs a new assessment.'];expect(parseBoundReview(raw,items,sources,ledger).get(0)?.verdict).toBe('fix')}
});
it('rejects top-level approval that contradicts its own textual issues',()=>{
 const raw=review();raw.results[0].issues=['The title has an unsupported identity.'];
 expect(()=>parseBoundReview(raw,items,sources,parseReaderInventory(inventory(),items))).toThrow('BINDING_VERDICT_CONTRADICTION');
});
it.each([
 ['ar','قال الرئيس عبد الفتاح السيسي إن القرار اتخذ.'],
 ['ar','قال قائد الجيش جوزيف عون إن القرار اتخذ.'],
 ['en','The former president did not approve the $15 million plan on Monday.'],
 ['fr',"Selon la ministre, Jean-Baptiste de La Tour pourrait annoncer une hausse de 3 % à Lyon."],
])('uses the same evidence contract for %s with no name or role dictionaries',async(language,headline)=>{
 const rows=[{headline,body:'',refs:['S1']}],calls:any[]=[];const port:ModelPort={complete:async req=>{calls.push(req);return {text:JSON.stringify(calls.length===1?inventory(rows):{results:[{i:0,inventory:'complete',verdict:'ok',issues:[],facets:[{id:'I0.H-F1',support:'supported',evidence:[{source:'S1',quote:headline}],explanation:'Every facet is explicitly supported.'}]}]}),inputTokens:10,outputTokens:10,costUsd:.001}}};
 const result=await verifySourceBoundClaims(port,new UsageMeter(),{model:'existing-verifier',language,items:rows,sources:[{ref:'S1',text:headline}],prior:[]});
 expect(result.get(0)?.verdict).toBe('ok');expect(calls).toHaveLength(2);
 const first=JSON.parse(calls[0].user);expect(first).not.toHaveProperty('sources');expect(first).not.toHaveProperty('prior');
 expect(calls[1].user).toContain(headline);
});
it('preserves provider/unknown errors and never launches a correction after them',async()=>{
 let calls=0;const port:ModelPort={complete:async()=>{calls++;throw Error('UNKNOWN_PAYMENT_OUTCOME')}};
 await expect(verifySourceBoundClaims(port,new UsageMeter(),{model:'existing-verifier',language:'ar',items,sources,prior:[]})).rejects.toThrow('UNKNOWN_PAYMENT_OUTCOME');expect(calls).toBe(1);
});
it('preserves an adverse received facet across a contradictory correction instead of converting it to supported',async()=>{
 let calls=0;const port:ModelPort={complete:async()=>{calls++;return {text:JSON.stringify(calls===1?inventory():calls===2?review('contradicted'):review()),inputTokens:10,outputTokens:10}}};
 const result=await verifySourceBoundClaims(port,new UsageMeter(),{model:'verifier',language:'ar',items,sources,prior:[]});
 expect(calls).toBe(3);expect(result.get(0)).toMatchObject({verdict:'fix',issues:[expect.stringContaining('PRIOR_ADVERSE_BINDING_REQUIRES_REPAIR')]});
});
it('isolates exhausted malformed inventories without converting them to factual or quiet approvals',async()=>{
 let calls=0;const port:ModelPort={complete:async()=>{calls++;return {text:'{}',inputTokens:10,outputTokens:10}}};
 const result=await verifySourceBoundClaims(port,new UsageMeter(),{model:'verifier',language:'ar',items,sources,prior:[]});
 expect(calls).toBe(2);expect(result.get(0)?.verdict).toBe('fix');
});
it('preserves an independently valid sibling when another item has malformed proofs twice',async()=>{
 const rows=[{headline:'A claim.',body:'',refs:['S1']},{headline:'B claim.',body:'',refs:['S2']}],evidence=[{ref:'S1',text:'A claim.'},{ref:'S2',text:'B claim.'}];let calls=0;
 const port:ModelPort={complete:async()=>{calls++;return {text:JSON.stringify(calls===1?inventory(rows):{results:rows.map((item,i)=>({i,inventory:'complete',verdict:'ok',issues:[],facets:[{id:`I${i}.H-F1`,support:'supported',evidence:[{source:item.refs[0],quote:i===0?'fabricated proof':'B claim.'}],explanation:'Source binding.'}]}))}),inputTokens:10,outputTokens:10}}};
 const result=await verifySourceBoundClaims(port,new UsageMeter(),{model:'verifier',language:'en',items:rows,sources:evidence,prior:[]});
 expect(calls).toBe(3);expect(result.get(0)?.verdict).toBe('fix');expect(result.get(1)?.verdict).toBe('ok');
});
it('does not allow redundancy without a valid prior reader identity',()=>{
 const raw=review('supported','redundant');expect(()=>parseBoundReview(raw,items,sources,parseReaderInventory(inventory(),items))).toThrow();
});
it('routes a wrong Arabic identity through targeted repair, extracts the repaired text again, and preserves an approved English sibling',async()=>{
 const bad='أعلن الرئيس عبد الفتاح الوحش قراراً.',good='أعلن الرئيس عبد الفتاح السيسي قراراً.',sibling='The park opened.';
 const requests:any[]=[];let inventories=0,bindings=0;
 const port:ModelPort={complete:async request=>{
  requests.push(request);let content:unknown;
  if(request.system.startsWith('You are the editor'))content={items:[{headline:bad,body:'',sources:['S1'],relation:'new',updates:null,importance:1},{headline:sibling,body:'',sources:['S2'],relation:'new',updates:null,importance:2}]};
  else if(request.system.startsWith('Independently inventory')){inventories++;const p=JSON.parse(request.user);content={units:p.units.map((u:any)=>({id:u.id,facets:[{id:u.id+'-F1',quote:u.text,claim:u.text,kind:'identity'}]}))}}
  else if(request.system.startsWith('You are a meticulous source-grounded')){bindings++;const p=JSON.parse(request.user);content={results:p.items.map((item:any,i:number)=>({i,inventory:'complete',verdict:bindings===1&&i===0?'fix':'ok',issues:[],facets:p.inventory.filter((f:any)=>f.item===i).map((f:any)=>({id:f.id,support:bindings===1&&i===0?'contradicted':'supported',evidence:[{source:item.refs[0],quote:p.sources.find((s:any)=>s.ref===item.refs[0]).text}],explanation:'Compared the entire actor identity and action.'}))}))}}
  else content={items:[{i:0,headline:good,body:'',drop:false}]};
  return {text:JSON.stringify(content),inputTokens:10,outputTokens:10,costUsd:.001};
 }};
 const result=await generateBriefing({feed:{...FEED,language:'ar',identityFidelityPolicy:'source-bound-claims-v1'},...WINDOW,articles:[article('a',good),article('b',sibling)]},port,MODELS,{prepare:{minChars:1}});
 expect(result.items.map(v=>v.headline)).toEqual([good,sibling]);expect(inventories).toBe(2);expect(bindings).toBe(2);
 const repairedInventory=JSON.parse(requests.filter(r=>r.system.startsWith('Independently inventory'))[1].user);expect(repairedInventory.units.map((u:any)=>u.text)).toEqual([good]);
 expect(result.usage.calls).toBe(6);
});
it('withholds a semantically unresolved item and preserves a separately supported sibling',async()=>{
 let count=0;const port:ModelPort={complete:async request=>{count++;const p=count===1?null:JSON.parse(request.user);const content=count===1?{items:[{headline:'A claim.',body:'',sources:['S1'],relation:'new',importance:1},{headline:'B claim.',body:'',sources:['S2'],relation:'new',importance:2}]}:count===2?{units:p.units.map((u:any)=>({id:u.id,facets:[{id:u.id,quote:u.text,claim:u.text,kind:'other'}]}))}:{results:p.items.map((item:any,i:number)=>({i,inventory:'complete',verdict:i===0?'fix':'ok',issues:[],facets:p.inventory.filter((f:any)=>f.item===i).map((f:any)=>({id:f.id,support:i===0?'uncertain':'supported',evidence:i===0?[]:[{source:'S2',quote:'B claim.'}],explanation:'Source scope.'}))}))};return {text:JSON.stringify(content),inputTokens:10,outputTokens:10}}};
 const result=await generateBriefing({feed:{...FEED,identityFidelityPolicy:'source-bound-claims-v1'},...WINDOW,articles:[article('a','A source.'),article('b','B claim.')]},port,MODELS,{maxRepairs:0,prepare:{minChars:1}});
 expect(result.items.map(v=>v.headline)).toEqual(['B claim.']);expect(result.dropped[0]).toMatchObject({carry:true,sourceIds:['a']});expect(result.status).toBe('published');
});

import {expect,it} from 'vitest';
import {readerUnits,readerTokens,decodeInventory,parseReaderInventory,parseReaderObligations,parseBoundReview,verifySourceBoundClaims} from '../src/source-bound-claims';
it('keeps every claim witness and excludes a same-speaker citation that never supports a claim',()=>{
 const headline='Kanaan said the budget could reach Parliament before the holidays.';
 const sources=[{ref:'S1',text:headline},{ref:'S2',text:'Before the holidays.'},{ref:'S3',text:'Kanaan urged support for the army.'}];
 const items=[{headline,body:'',refs:sources.map(s=>s.ref)}];
 const facets=parseReaderInventory({units:[{id:'I0.H',facets:[{id:'f',quote:headline,claim:headline,kind:'action'}]}]},items);
 const result={i:0,inventory:'complete',verdict:'ok',issues:[],citationChecks:Object.fromEntries(sources.map(s=>[s.ref,{quote:s.text,support:'supported',explanation:'Model label.'}])),facets:[{id:'f',support:'supported',evidence:sources.slice(0,2).map(s=>({source:s.ref,quote:s.text})),explanation:'Both passages establish the claim.'}]};
 const review=()=>parseBoundReview({results:[result]},items,sources,facets,[],undefined,true).get(0);
 expect(review()).toMatchObject({verdict:'ok',proofRefs:['S1','S2']});
 result.citationChecks.S3.support='unsupported';
 expect(review()).toMatchObject({verdict:'ok',proofRefs:['S1','S2']});
 result.citationChecks.S2.support='uncertain';
 expect(review).toThrow('BINDING_VERDICT_CONTRADICTION');
});
it('reconstructs complete multi-token names and roles from contiguous original token IDs',()=>{
 const headline='أعلن الرئيس عبد الفتاح السيسي قراراً.';
 expect(readerTokens(headline).map(t=>t.text)).toEqual(['أعلن','الرئيس','عبد','الفتاح','السيسي','قراراً']);
 const rows=[{headline,body:'',refs:['S1']}];
 const f=decodeInventory({units:{'I0.H':[{claim:'A name hint',kind:'identity',personTokens:['T2','T3','T4'],roleTokens:['T1']}]}},rows)[0];
 expect(f.personName).toBe('عبد الفتاح السيسي');expect(f.roleSurface).toBe('الرئيس');expect(f.claim).toBe(headline);
 expect(decodeInventory({units:{'I0.H':[{claim:'x',kind:'identity',personTokens:{start:'T2',end:'T4'},roleTokens:{start:'',end:''}}]}},rows)[0].personName).toBe('عبد الفتاح السيسي');
 expect(()=>decodeInventory({units:{'I0.H':[{claim:'x',kind:'identity',personTokens:{start:'T2',end:'T99'},roleTokens:[]}]}},rows)).toThrow('INVALID_READER_TOKEN_SPAN');
});
it('cannot erase a source-only occupational role by clearing reviewer metadata',async()=>{
 const requests:any[]=[],rows=[{headline:'Commander Jane Doe approved.',body:'',refs:['S1']}];
 const port:ModelPort={complete:async request=>{
  requests.push(request);const p=JSON.parse(request.user.split('\n\nYour previous')[0]);let raw:unknown;
  if(requests.length===1)raw={units:{'I0.H':[{claim:rows[0].headline,kind:'identity',personTokens:['T1','T2'],roleTokens:['T0']}]}};
  else if(requests.length===2){expect(p).not.toHaveProperty('items');expect(request.user).not.toContain('Commander');raw={sources:{S1:[{personTokens:['T1','T2'],roleTokens:['T0']}]}}}
  else raw={results:{'0':{inventory:'complete',verdict:'ok',issues:[],priorIds:[],citationChecks:{S1:{support:'supported',quote:'S1:P0',explanation:'Same statement.'}},facets:Object.fromEntries(p.inventory.map((f:any)=>[f.id,{support:'supported',sourcePersonName:'Jane Doe',sourceRoleSurface:'',evidence:[{source:'S1',quote:'S1:P0'}],explanation:'Model approved.'}]))}}};
  return {text:JSON.stringify(raw),inputTokens:1,outputTokens:1};
 }};
 const result=await verifySourceBoundClaims(port,new UsageMeter(),{model:'m',independentSourceBindings:true,language:'en',items:rows,sources:[{ref:'S1',text:'President Jane Doe approved.'}],prior:[]});
 expect(requests).toHaveLength(3);expect(result.get(0)?.verdict).toBe('fix');expect(result.get(0)?.issues.join(' ')).toContain('INDEPENDENT_ROLE_MISMATCH');
});
it('withholds only stories whose source inventory remains malformed, preserving a verified sibling',async()=>{
 const rows=[{headline:'President Jane Doe approved.',body:'',refs:['S1']},{headline:'Mayor Alex Roe approved.',body:'',refs:['S2']}];let calls=0;
 const sources=[{ref:'S1',text:rows[0].headline},{ref:'S2',text:rows[1].headline}];
 const port:ModelPort={complete:async request=>{
  calls++;const p=JSON.parse(request.user.split('\n\nYour previous')[0]);let raw:unknown;
  if(calls===1)raw={units:rows.map((r,i)=>({id:`I${i}.H`,facets:[{id:`F${i}`,quote:r.headline,claim:r.headline,kind:'other'}]}))};
  else if(calls<4)raw={sources:{S1:[{personTokens:{start:'T1',end:'T2'},roleTokens:{start:'T0',end:'T0'}}],S2:[{personTokens:{start:'T999',end:'T999'},roleTokens:{start:'',end:''}}]}};
  else raw={results:rows.map((r,i)=>({i,inventory:'complete',verdict:'ok',issues:[],facets:p.inventory.filter((f:any)=>f.item===i).map((f:any)=>({id:f.id,support:'supported',evidence:[{source:r.refs[0],quote:r.headline}],explanation:'Supported reader text.'}))}))};
  return {text:JSON.stringify(raw),inputTokens:1,outputTokens:1};
 }};
 const result=await verifySourceBoundClaims(port,new UsageMeter(),{model:'m',independentSourceBindings:true,language:'en',items:rows,sources,prior:[]});
 expect(calls).toBe(4);expect(result.get(0)?.verdict).toBe('ok');expect(result.get(1)?.verdict).toBe('fix');expect(result.get(1)?.issues.join(' ')).toContain('SOURCE_IDENTITY_INVENTORY_UNRESOLVED');
});
it('does not accept a current office when the independently bound source role says former',()=>{
 const headline='President Jane Doe approved.',text='Former president Jane Doe approved.';
 const rows=[{headline,body:'',refs:['S1']}],facets=parseReaderInventory({units:[{id:'I0.H',facets:[{id:'p',quote:headline,claim:headline,kind:'identity',personName:'Jane Doe',roleSurface:'President'}]}]},rows);
 const result=parseBoundReview({results:[{i:0,inventory:'complete',verdict:'ok',issues:[],facets:[{id:'p',support:'supported',sourcePersonName:'Jane Doe',sourceRoleSurface:'Former president',evidence:[{source:'S1',quote:text}],explanation:'Model approved.'}]}]},rows,[{ref:'S1',text}],facets);
 expect(result.get(0)?.verdict).toBe('fix');
});
import {UsageMeter,type ModelPort} from '../src/model';
it('keeps previous faulty drafts and reviews out of fresh repaired-text factual verification',async()=>{
 const seen:any[]=[];const port:ModelPort={complete:async request=>{
  seen.push(request);const p=JSON.parse(request.user);let raw:unknown;
  if(seen.length===1)raw={units:{'I0.H':[]}};
  else if(seen.length===2)raw={sources:{S1:[]}};
  else raw={results:{'0':{inventory:'complete',verdict:'ok',issues:[],priorIds:[],citationChecks:{S1:{support:'supported',quote:'S1:P0',explanation:'Explicit source.'}},facets:{'FULL_READER_I0.H':{support:'supported',evidence:[{source:'S1',quote:'S1:P0'}],explanation:'Explicit source.'}}}}};
  return {text:JSON.stringify(raw),inputTokens:1,outputTokens:1};
 }};
 await verifySourceBoundClaims(port,new UsageMeter(),{model:'m',independentSourceBindings:true,language:'en',items:[{headline:'The bridge opened.',body:'',refs:['S1']}],sources:[{ref:'S1',text:'The bridge opened.'}],prior:[],context:JSON.stringify({windowEnd:'2026-11-18T08:00:00Z',previousReviews:[{body:'POISONED_PREVIOUS_DRAFT',issues:['POISONED_REVIEW']} ]})});
 const review=seen.at(-1);expect(review.user).not.toContain('POISONED_PREVIOUS_DRAFT');expect(review.user).not.toContain('POISONED_REVIEW');expect(review.user).toContain('2026-11-18T08:00:00Z');
});
it.each([
 ['قال نجيب سلام إن القرار اتخذ.','قال سلام إن القرار اتخذ.','نجيب سلام','سلام','fix'],
 ['قال عبد الفتاح الوحش إن القرار اتخذ.','قال عبد الفتاح السيسي إن القرار اتخذ.','عبد الفتاح الوحش','عبد الفتاح السيسي','fix'],
 ['قال سلام إن القرار اتخذ.','قال نواف سلام إن القرار اتخذ.','سلام','نواف سلام','ok'],
 ['قال جون سميث إن القرار اتخذ.','John Smith said the decision was taken.','جون سميث','John Smith','ok'],
 ['Macron approved the plan.','Emmanuel Macron approved the plan.','Macron','Emmanuel Macron','ok'],
])('checks complete person surfaces without a name/role dictionary: %s',(headline,text,personName,sourcePersonName,verdict)=>{
 const rows=[{headline,body:'',refs:['S1']}];const facets=parseReaderInventory({units:[{id:'I0.H',facets:[{id:'name',quote:headline,claim:headline,kind:'identity',personName}]}]},rows);
 const result=parseBoundReview({results:[{i:0,inventory:'complete',verdict:'ok',issues:[],facets:[{id:'name',support:'supported',sourcePersonName,evidence:[{source:'S1',quote:text}],explanation:'Model-approved identity.'}]}]},rows,[{ref:'S1',text}],facets);
 expect(result.get(0)?.verdict).toBe(verdict);
 if(verdict==='fix')expect(result.get(0)?.issues[0]).toContain('PERSON_NAME_NOT_SOURCE_BOUND');
});
it('adds a mandatory full-reader assessment when extraction misses a quantity or punctuation',()=>{
 const rows=[{headline:'The grant is $15 million.',body:'',refs:['S1']}];
 const facets=parseReaderObligations({units:[{id:'I0.H',facets:[{id:'actor',quote:'The grant',claim:'The grant',kind:'object'}]}]},rows);
 expect(facets.find(f=>f.id==='FULL_READER_I0.H')?.quote).toBe(rows[0].headline);
 const raw={results:[{i:0,inventory:'complete',verdict:'ok',issues:[],facets:[{id:'actor',support:'supported',evidence:[{source:'S1',quote:'The grant is $5 million.'}],explanation:'Actor exists.'}]}]};
 expect(()=>parseBoundReview(raw,rows,[{ref:'S1',text:'The grant is $5 million.'}],facets)).toThrow('MISSING_FACET_ASSESSMENT');
});
it.each([
 ['قائد الجيش','الرئيس','fix'],['الرئيس','الرئيس','ok'],
])('preserves explicit actor-role binding without an office-holder table: %s',(roleSurface,sourceRoleSurface,verdict)=>{
 const headline=`قال ${roleSurface} جوزيف عون إن القرار اتخذ.`,text='قال الرئيس جوزيف عون إن القرار اتخذ.';
 const rows=[{headline,body:'',refs:['S1']}],facets=parseReaderInventory({units:[{id:'I0.H',facets:[{id:'role',quote:headline,claim:headline,kind:'role',personName:'جوزيف عون',roleSurface}]}]},rows);
 const raw={results:[{i:0,inventory:'complete',verdict:'ok',issues:[],facets:[{id:'role',support:'supported',sourcePersonName:'جوزيف عون',sourceRoleSurface,evidence:[{source:'S1',quote:text}],explanation:'Model approved.'}]}]};
 expect(parseBoundReview(raw,rows,[{ref:'S1',text}],facets).get(0)?.verdict).toBe(verdict);
});
it('binds a name from the same cited article even when the action proof passage uses only a pronoun',()=>{
 const headline='President John Smith approved the plan.',text='President John Smith spoke. He approved the plan.';
 const rows=[{headline,body:'',refs:['S1']}],facets=parseReaderInventory({units:[{id:'I0.H',facets:[{id:'name',quote:headline,claim:headline,kind:'identity',personName:'President John Smith',roleSurface:'President'}]}]},rows);
 const raw={results:[{i:0,inventory:'complete',verdict:'ok',issues:[],facets:[{id:'name',support:'supported',sourcePersonName:'John Smith',sourceRoleSurface:'President',evidence:[{source:'S1',quote:'He approved the plan.'}],explanation:'Same actor throughout the article.'}]}]};
 expect(parseBoundReview(raw,rows,[{ref:'S1',text}],facets).get(0)?.verdict).toBe('ok');
});
it('never repairs fabricated reader quotations by adding the full-reader obligation',()=>{
 expect(()=>parseReaderObligations({units:[{id:'I0.H',facets:[{id:'bad',quote:'invented text',claim:'invented text',kind:'other'}]}]},[{headline:'Actual text.',body:'',refs:['S1']}])).toThrow('UNBOUND_READER_QUOTE');
});
it('uses required keyed fact/citation assessments and resolves proof IDs to exact original source passages',async()=>{
 const rows=[{headline:'Grant approved: $15 million.',body:'',refs:['S1']}];let calls=0;
 const port:ModelPort={complete:async request=>{
  calls++;expect(request.responseSchema).toBeDefined();const p=JSON.parse(request.user);
  const value=calls===1?{units:{'I0.H':[{claim:'The grant amount is $15 million.',kind:'quantity'}]}}:
  {results:{'0':{inventory:'complete',verdict:'fix',issues:['Amount differs.'],priorIds:[],citationChecks:{S1:{support:'supported',quote:p.evidencePassages[0].id,explanation:'Same grant.'}},facets:Object.fromEntries(p.inventory.map((f:any)=>[f.id,{support:'contradicted',evidence:[{source:'S1',quote:p.evidencePassages[0].id}],explanation:'The source amount is $5 million.'}]))}}};
  return {text:JSON.stringify(value),inputTokens:1,outputTokens:1};
 }};
 const result=await verifySourceBoundClaims(port,new UsageMeter(),{model:'m',language:'en',items:rows,sources:[{ref:'S1',text:'Grant approved: $5 million.'}],prior:[]});
 expect(calls).toBe(2);expect(result.get(0)?.verdict).toBe('fix');expect(result.get(0)?.issues.join(' ')).toContain('contradicted');
});
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
it('identifies exact missing connector and punctuation spans across units for the bounded correction without relaxing coverage',()=>{
 const rows=[{headline:'A and B.',body:'C; D.',refs:['S1']}];
 const raw={units:[{id:'I0.H',facets:[{id:'a',quote:'A',claim:'A',kind:'identity'},{id:'b',quote:'B',claim:'B',kind:'identity'}]},
 {id:'I0.B',facets:[{id:'c',quote:'C',claim:'C',kind:'identity'},{id:'d',quote:'D',claim:'D',kind:'identity'}]}]};
 try{parseReaderInventory(raw,rows);throw Error('Expected rejection')}catch(e){
  expect(String(e)).toContain('UNINVENTORIED_READER_TEXT');expect(String(e)).toContain('and');expect(String(e)).toContain('I0.B');expect(String(e)).toContain(';');
 }
 raw.units[0].facets[0].quote='A and ';raw.units[0].facets[1].quote='B.';
 raw.units[1].facets[0].quote='C; ';raw.units[1].facets[1].quote='D.';
 expect(parseReaderInventory(raw,rows)).toHaveLength(4);
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
 const rows=[{headline,body:'',refs:['S1']}],calls:any[]=[];const port:ModelPort={complete:async req=>{calls.push(req);return {text:JSON.stringify(calls.length===1?inventory(rows):{results:[{i:0,inventory:'complete',verdict:'ok',issues:[],facets:['I0.H-F1','FULL_READER_I0.H'].map(id=>({id,support:'supported',evidence:[{source:'S1',quote:headline}],explanation:'Every facet is explicitly supported.'}))}]}),inputTokens:10,outputTokens:10,costUsd:.001}}};
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
 const port:ModelPort={complete:async()=>{calls++;return {text:JSON.stringify(calls===1?inventory(rows):{results:rows.map((item,i)=>({i,inventory:'complete',verdict:'ok',issues:[],facets:[`I${i}.H-F1`,`FULL_READER_I${i}.H`].map(id=>({id,support:'supported',evidence:[{source:item.refs[0],quote:i===0?'fabricated proof':'B claim.'}],explanation:'Source binding.'}))}))}),inputTokens:10,outputTokens:10}}};
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
  else if(request.system.startsWith('Independently ')){inventories++;const p=JSON.parse(request.user);content={units:p.units.map((u:any)=>({id:u.id,facets:[{id:u.id+'-F1',quote:u.text,claim:u.text,kind:'identity'}]}))}}
  else if(request.system.startsWith('You are a meticulous source-grounded')){bindings++;const p=JSON.parse(request.user);content={results:p.items.map((item:any,i:number)=>({i,inventory:'complete',verdict:bindings===1&&i===0?'fix':'ok',issues:[],facets:p.inventory.filter((f:any)=>f.item===i).map((f:any)=>({id:f.id,support:bindings===1&&i===0?'contradicted':'supported',evidence:[{source:item.refs[0],quote:p.sources.find((s:any)=>s.ref===item.refs[0]).text}],explanation:'Compared the entire actor identity and action.'}))}))}}
  else content={items:[{i:0,headline:good,body:'',drop:false}]};
  return {text:JSON.stringify(content),inputTokens:10,outputTokens:10,costUsd:.001};
 }};
 const result=await generateBriefing({feed:{...FEED,language:'ar',identityFidelityPolicy:'source-bound-claims-v1'},...WINDOW,articles:[article('a',good),article('b',sibling)]},port,MODELS,{prepare:{minChars:1}});
 expect(result.items.map(v=>v.headline)).toEqual([good,sibling]);expect(inventories).toBe(2);expect(bindings).toBe(2);
 const repairedInventory=JSON.parse(requests.filter(r=>r.system.startsWith('Independently '))[1].user);expect(repairedInventory.units.map((u:any)=>u.text)).toEqual([good]);
 expect(result.usage.calls).toBe(6);
});
it('withholds a semantically unresolved item and preserves a separately supported sibling',async()=>{
 let count=0;const port:ModelPort={complete:async request=>{count++;const p=count===1?null:JSON.parse(request.user);const content=count===1?{items:[{headline:'A claim.',body:'',sources:['S1'],relation:'new',importance:1},{headline:'B claim.',body:'',sources:['S2'],relation:'new',importance:2}]}:count===2?{units:p.units.map((u:any)=>({id:u.id,facets:[{id:u.id,quote:u.text,claim:u.text,kind:'other'}]}))}:{results:p.items.map((item:any,i:number)=>({i,inventory:'complete',verdict:i===0?'fix':'ok',issues:[],facets:p.inventory.filter((f:any)=>f.item===i).map((f:any)=>({id:f.id,support:i===0?'uncertain':'supported',evidence:i===0?[]:[{source:'S2',quote:'B claim.'}],explanation:'Source scope.'}))}))};return {text:JSON.stringify(content),inputTokens:10,outputTokens:10}}};
 const result=await generateBriefing({feed:{...FEED,identityFidelityPolicy:'source-bound-claims-v1'},...WINDOW,articles:[article('a','A source.'),article('b','B claim.')]},port,MODELS,{maxRepairs:0,prepare:{minChars:1}});
 expect(result.items.map(v=>v.headline)).toEqual(['B claim.']);expect(result.dropped[0]).toMatchObject({carry:true,sourceIds:['a']});expect(result.status).toBe('published');
});

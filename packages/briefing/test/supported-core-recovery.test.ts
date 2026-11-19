import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {BriefingModelError,BriefingBudgetError} from '../src/types';
import {article,FEED,MODELS,scripted,WINDOW} from './helpers';
import {auditRepairCoverage} from '../src/verification-recovery';
import {UsageMeter} from '../src/model';
it('scopes V2 material retention to the original selected story without treating its draft as evidence',async()=>{
 let calls=0;
 const port={complete:async(request:any)=>{calls++;const p=JSON.parse(request.user);
  expect(p.items[0].originalSelectedStory).toEqual({headline:'A bridge reopened.',body:'The northern crossing reopened after inspection.'});
  expect(request.system).toContain('not whether the original editor covered every development');
  expect(request.system).toContain('each material subgroup');
  expect(request.system).toContain('Do not restore unsupported original assertions');
  return {text:JSON.stringify({results:{'0':{status:'preserved',reason:'Original material facts retained; unrelated airport news is outside this selected story.',developments:[{sourceRef:'S1',sourceQuote:p.sourcePassages[0].id,readerQuote:'R0.B'}]}}}),inputTokens:1,outputTokens:1};
 }};
 const blocked=await auditRepairCoverage(port,new UsageMeter(),'m',{feed:{...FEED,identityFidelityPolicy:'source-bound-claims-v2'},...WINDOW,articles:[]},[{index:0,headline:'Northern bridge reopens.',body:'The northern crossing reopened after inspection.',refs:['S1'],history:[{headline:'A bridge reopened.',body:'The northern crossing reopened after inspection.',issues:['Style is not evidence.']}]}],[{ref:'S1',id:'a',source:'Local report',publishedAt:WINDOW.windowStart,text:'The northern crossing reopened after inspection. Separately, airport workers voted to strike.',alsoIds:[],similarRefs:[]}]);
 expect(calls).toBe(1);expect(blocked.size).toBe(0);
});
it('proves no material text was removed by an exact independently source-bound role-only repair',async()=>{
 let calls=0;const port={complete:async()=>{calls++;throw Error('Unnecessary fallible coverage call')}};
 const body='President Jane Doe approved the bridge reopening, subject to inspection. Three crossings remain closed.';
 const blocked=await auditRepairCoverage(port,new UsageMeter(),'m',{feed:{...FEED,identityFidelityPolicy:'source-bound-claims-v2'},...WINDOW,articles:[]},[{index:0,headline:'Bridge reopening approved',body,refs:['S1'],history:[{headline:'Bridge reopening approved',body:body.replace('President','Commander'),issues:['INDEPENDENT_ROLE_MISMATCH: Jane Doe / Commander -> President. Preserve the independently extracted current source role.']}]}],[{ref:'S1',id:'a',source:'Report',publishedAt:WINDOW.windowStart,text:body,alsoIds:[],similarRefs:[]}]);
 expect(calls).toBe(0);expect(blocked.size).toBe(0);
});
it('proves exact source-bound given-name removal without dropping any role, condition or material text',async()=>{
 let calls=0;const port={complete:async()=>{calls++;throw Error('Unnecessary coverage inference')}};
 const headline='Prime minister Salam cancelled the session because of a family circumstance.';
 const blocked=await auditRepairCoverage(port,new UsageMeter(),'m',{feed:{...FEED,identityFidelityPolicy:'source-bound-claims-v2'},...WINDOW,articles:[]},[{index:0,headline,body:'',refs:['S1'],history:[{headline:headline.replace('Salam','Najib Salam'),body:'',issues:['PERSON_NAME_NOT_SOURCE_BOUND: Najib Salam -> Salam | Putin. Use only the identity established by cited evidence.']}]}],[{ref:'S1',id:'a',source:'Report',publishedAt:WINDOW.windowStart,text:'The prime minister office said Salam cancelled the session because of a family circumstance.',alsoIds:[],similarRefs:[]}]);
 expect(calls).toBe(0);expect(blocked.size).toBe(0);
});
it('permits a source-established surname reference during an otherwise exact role-only repair',async()=>{
 let calls=0;const port={complete:async()=>{calls++;throw Error('Unnecessary coverage inference')}};
 const original='Commander Jane Doe approved. Three crossings remain closed.';
 const blocked=await auditRepairCoverage(port,new UsageMeter(),'m',{feed:{...FEED,identityFidelityPolicy:'source-bound-claims-v2'},...WINDOW,articles:[]},[{index:0,headline:'Crossing update',body:'President Doe approved. Three crossings remain closed.',refs:['S1'],history:[{headline:'Crossing update',body:original,issues:['INDEPENDENT_ROLE_MISMATCH: Jane Doe / Commander -> President. Preserve the independently extracted current source role.']}]}],[{ref:'S1',id:'a',source:'Report',publishedAt:WINDOW.windowStart,text:'President Jane Doe approved. Three crossings remain closed.',alsoIds:[],similarRefs:[]}]);
 expect(calls).toBe(0);expect(blocked.size).toBe(0);
});
it.each(['omitted-group','changed-count','unbound-title','unrelated-actor'])('does not bypass material coverage for %s',async fault=>{
 const original='Commander Jane Doe announced 123 detainees. Three crossings remain closed.';
 const corrected=original.replace('Commander','President');let calls=0;
 const body=fault==='omitted-group'?corrected.split('. ')[0]+'.':fault==='changed-count'?corrected.replace('123','23'):corrected;
 const source=fault==='unbound-title'?'Jane Doe announced 123 detainees.':fault==='unrelated-actor'?'President Alex Roe announced 123 detainees.':corrected;
 const port={complete:async(request:any)=>{calls++;const p=JSON.parse(request.user);return {text:JSON.stringify({results:{'0':{status:'incomplete',reason:'Material retention requires review.',developments:[{sourceRef:'S1',sourceQuote:p.sourcePassages[0].id,readerQuote:null}]}}}),inputTokens:1,outputTokens:1}}};
 const blocked=await auditRepairCoverage(port,new UsageMeter(),'m',{feed:{...FEED,identityFidelityPolicy:'source-bound-claims-v2'},...WINDOW,articles:[]},[{index:0,headline:'Report',body,refs:['S1'],history:[{headline:'Report',body:original,issues:['INDEPENDENT_ROLE_MISMATCH: Jane Doe / Commander -> President. Preserve the independently extracted current source role.']}]}],[{ref:'S1',id:'a',source:'Report',publishedAt:WINDOW.windowStart,text:source,alsoIds:[],similarRefs:[]}]);
 expect(calls).toBe(1);expect(blocked.has(0)).toBe(true);
});

// Source-derived development case, not an untouched test or paid-model result.
// The 17 Nov retained army statement distinguishes a wanted suspect, three
// Lebanese, one Palestinian and 123 Syrians; the last group's stated grounds
// must not be attached to every detainee. These fixtures paraphrase that case.
const source='The army arrested a wanted suspect in Rehab, Baabda for kidnapping, armed robbery, shooting and drug trafficking. It also detained three Lebanese for unlicensed pistols, one Palestinian for failing to obey checkpoint orders, and 123 Syrians for illegal entry and lack of legal papers. Investigations are supervised by the competent judiciary.';
const draft=(headline:string,refs=['S1'])=>({headline,body:'',sources:refs,relation:'new',updates:null,importance:1});
const original='Army arrests wanted suspect and detains 126 others';
const attempted='Army detains 127 people including 123 Syrians for illegal entry';
const short='Army reports arresting a wanted suspect in Rehab, Baabda';
const safe='Army arrests a wanted suspect in Rehab, Baabda for kidnapping, armed robbery, shooting and drug trafficking; also detains three Lebanese for unlicensed pistols, one Palestinian for failing to obey checkpoint orders, and 123 Syrians for illegal entry and lack of legal papers';
const countIssue='The source describes 127 others, not 126 others.';
const scopeIssue='Do not imply that all detainees were arrested for illegal entry.';
const input={feed:{...FEED,interest:'Lebanese security developments',verificationRecoveryPolicy:'supported-core-v2' as const},...WINDOW,articles:[article('army',source)]};


const coverage=(status='preserved',readerMissing=false)=>({results:[{i:0,status,reason:readerMissing?'The detention of 123 Syrians and the other groups disappeared.':'All independently supported developments remain.',developments:[{sourceRef:'S1',sourceQuote:'The army arrested a wanted suspect in Rehab, Baabda',readerQuote:readerMissing?'wanted suspect in Rehab, Baabda':'wanted suspect in Rehab, Baabda for kidnapping, armed robbery, shooting and drug trafficking'},...['three Lebanese for unlicensed pistols','one Palestinian for failing to obey checkpoint orders','123 Syrians for illegal entry and lack of legal papers'].map(quote=>({sourceRef:'S1',sourceQuote:quote,readerQuote:readerMissing?null:quote}))]}]});

it('supplies the full failed-repair history and uses the last existing repair for a supported core, still requiring verification',async()=>{
 const x=scripted({edit:[{items:[draft(original)]}],verify:[{results:[{i:0,verdict:'fix',issues:[countIssue]}]},{results:[{i:0,verdict:'fix',issues:[scopeIssue]}]},{results:[{i:0,verdict:'ok',issues:[]}]}],repair:[{items:[{i:0,headline:attempted,body:'',drop:false}]},{items:[{i:0,headline:safe,body:'',drop:false}]}],recovery_coverage:[coverage()]});
 const result=await generateBriefing(input,x.port,MODELS);
 expect(result.status).toBe('published');expect(result.items[0]).toMatchObject({headline:safe,sourceIds:['army']});
 expect(result.usage.calls).toBe(7);expect(result.usage.costUsd).toBeCloseTo(.007);
 const repairs=x.calls.filter(c=>c.stage==='repair');
 expect(repairs[0].request.user).toContain('REPAIR HISTORY');expect(repairs[0].request.user).not.toContain('FINAL SUPPORTED-CORE REPAIR');
 expect(repairs[1].request.user).toContain('FINAL SUPPORTED-CORE REPAIR');
 for(const text of [original,attempted,countIssue,scopeIssue,source])expect(repairs[1].request.user).toContain(text);
 expect(repairs[1].request.system).toContain('Do not infer an overall total');
 expect(x.calls.filter(c=>c.stage==='verify').every(c=>c.request.system.includes('An accurate subset is not sufficient editorial coverage'))).toBe(true);
 expect(x.calls.map(c=>c.stage)).toEqual(['edit','verify','repair','verify','repair','verify','recovery_coverage']);
});

it('does not publish an unapproved supported-core proposal, add repair rounds, or erase carry-forward evidence',async()=>{
 const x=scripted({edit:[{items:[draft(original)]}],verify:Array.from({length:3},()=>({results:[{i:0,verdict:'fix',issues:[countIssue]}]})),repair:[{items:[{i:0,headline:attempted,body:'',drop:false}]},{items:[{i:0,headline:safe,body:'',drop:false}]}]});
 const result=await generateBriefing(input,x.port,MODELS);
 expect(result.status).toBe('rejected');expect(result.items).toEqual([]);expect(result.dropped).toEqual([expect.objectContaining({carry:true,sourceIds:['army']})]);expect(x.calls).toHaveLength(6);
 expect(x.calls.filter(c=>c.stage==='repair')[1].request.user).toContain('FINAL SUPPORTED-CORE REPAIR');
});

it('keeps already verified sibling stories when one story cannot be repaired',async()=>{
 const x=scripted({edit:[{items:[draft('Road reopened',['S2']),draft(original)]}],verify:[{results:[{i:0,verdict:'ok',issues:[]},{i:1,verdict:'fix',issues:[countIssue]}]},{results:[{i:0,verdict:'fix',issues:[scopeIssue]}]},{results:[{i:0,verdict:'drop',issues:['Still unsupported']}]}],repair:[{items:[{i:0,headline:attempted,body:'',drop:false}]},{items:[{i:0,headline:safe,body:'',drop:false}]}]});
 const result=await generateBriefing({...input,articles:[...input.articles,article('road','The municipality reopened the coastal road after completing its repairs.')]},x.port,MODELS);
 expect(result.status).toBe('published');expect(result.items.map(item=>item.sourceIds)).toEqual([['road']]);expect(result.dropped[0]).toMatchObject({sourceIds:['army'],carry:true});
 const history=x.calls.filter(c=>c.stage==='repair')[1].request.user;expect(history).toContain('#0');expect(history).not.toContain('headline: Road reopened');expect(history).toContain('REPAIR HISTORY');
});

it('keeps recovery instructions out of unmarked frozen requests',async()=>{
 const replies=()=>({edit:[{items:[draft(original)]}],verify:[{results:[{i:0,verdict:'fix',issues:[countIssue]}]},{results:[{i:0,verdict:'ok',issues:[]}]}],repair:[{items:[{i:0,headline:safe,body:'',drop:false}]}]});
 const {verificationRecoveryPolicy:_,...feed}=input.feed;
 const legacy=scripted(replies());await generateBriefing({...input,feed},legacy.port,MODELS);
 const candidate=scripted(replies());await generateBriefing({...input,feed:{...input.feed,verificationRecoveryPolicy:'supported-core-v1'}},candidate.port,MODELS);
 expect(legacy.calls[0].request).toEqual(candidate.calls[0].request);
 expect(legacy.calls[1].request.system).not.toContain('SUPPORTED-CORE VERIFICATION');
 expect(legacy.calls[2].request.user).not.toContain('REPAIR HISTORY');
 expect(candidate.calls[2].request.user).toContain('REPAIR HISTORY');
});


it.each(['incomplete','preserved'])('rejects a factually approved but materially incomplete core even when coverage status is %s',async status=>{
 const x=scripted({edit:[{items:[draft(original)]}],verify:[{results:[{i:0,verdict:'fix',issues:[countIssue]}]},{results:[{i:0,verdict:'fix',issues:[scopeIssue]}]},{results:[{i:0,verdict:'ok',issues:[]}]}],repair:[{items:[{i:0,headline:attempted,body:'',drop:false}]},{items:[{i:0,headline:short,body:'',drop:false}]}],recovery_coverage:[coverage(status,true)]});
 const result=await generateBriefing(input,x.port,MODELS);
 expect(result.status).toBe('rejected');expect(result.items).toEqual([]);expect(result.dropped).toContainEqual(expect.objectContaining({carry:true,sourceIds:['army'],reason:expect.stringContaining('EDITORIAL_RECOVERY_COVERAGE')}));
 const check=x.calls.find(c=>c.stage==='recovery_coverage')!;expect(check.request.model).toBe(MODELS.editor);expect(check.request.user).toContain('123 Syrians');expect(check.request.user).toContain(original);expect(check.request.user).toContain(short);
});

it('defers uncertain material coverage without inventing a successful editorial assessment',async()=>{
 const x=scripted({edit:[{items:[draft(original)]}],verify:[{results:[{i:0,verdict:'fix',issues:[countIssue]}]},{results:[{i:0,verdict:'ok',issues:[]}]}],repair:[{items:[{i:0,headline:safe,body:'',drop:false}]}],recovery_coverage:[coverage('uncertain')]});
 const r=await generateBriefing(input,x.port,MODELS);expect(r.status).toBe('rejected');expect(r.dropped[0].reason).toContain('uncertain');expect(r.dropped[0].carry).toBe(true);
});

it.each(['sourceQuote','readerQuote','sourceRef'] as const)('rejects invented %s proof in the coverage gate',async field=>{
 const invalid=coverage();invalid.results[0].developments[0][field]='This invented reference was never supplied';
 const x=scripted({edit:[{items:[draft(original)]}],verify:[{results:[{i:0,verdict:'fix',issues:[countIssue]}]},{results:[{i:0,verdict:'ok',issues:[]}]}],repair:[{items:[{i:0,headline:safe,body:'',drop:false}]}],recovery_coverage:[invalid,invalid]});
 const result=await generateBriefing(input,x.port,MODELS);expect(result.status).toBe('rejected');expect(result.items).toEqual([]);expect(result.dropped[0]).toMatchObject({carry:true,sourceIds:['army'],reason:expect.stringContaining('UNGROUNDED_RECOVERY_COVERAGE')});
});


it('keeps a complete verified sibling while withholding an incomplete repaired story',async()=>{
 const x=scripted({edit:[{items:[draft('Road reopened',['S2']),draft(original)]}],verify:[{results:[{i:0,verdict:'ok',issues:[]},{i:1,verdict:'fix',issues:[countIssue]}]},{results:[{i:0,verdict:'ok',issues:[]}]}],repair:[{items:[{i:0,headline:short,body:'',drop:false}]}],recovery_coverage:[coverage('incomplete',true)]});
 const r=await generateBriefing({...input,articles:[...input.articles,article('road','The municipality reopened the coastal road.')]},x.port,MODELS);
 expect(r.status).toBe('published');expect(r.items.map(i=>i.sourceIds)).toEqual([['road']]);expect(r.dropped[0]).toMatchObject({carry:true,sourceIds:['army'],reason:expect.stringContaining('EDITORIAL_RECOVERY_COVERAGE')});
});


it.each(['not JSON',{results:[{i:0,status:'preserved',reason:'Claimed proof',developments:[{sourceRef:'invented',sourceQuote:'fabricated',readerQuote:'fabricated'}]}]}])('preserves the verified sibling after two unusable coverage replies: %j',async bad=>{
 const x=scripted({edit:[{items:[draft('Road reopened',['S2']),draft(original)]}],verify:[{results:[{i:0,verdict:'ok',issues:[]},{i:1,verdict:'fix',issues:[countIssue]}]},{results:[{i:0,verdict:'ok',issues:[]}]}],repair:[{items:[{i:0,headline:safe,body:'',drop:false}]}],recovery_coverage:[bad,bad]});
 const result=await generateBriefing({...input,articles:[...input.articles,article('road','The municipality reopened the coastal road.')]},x.port,MODELS);
 expect(result.status).toBe('published');expect(result.items.map(i=>i.sourceIds)).toEqual([['road']]);expect(result.dropped).toEqual([expect.objectContaining({carry:true,sourceIds:['army'],reason:expect.stringContaining('EDITORIAL_RECOVERY_COVERAGE: unusable after correction')})]);
 const checks=x.calls.filter(c=>c.stage==='recovery_coverage');expect(checks).toHaveLength(2);expect(checks[1].request.user).toContain('Your previous reply could not be used');
 expect(result.usage.calls).toBe(6);expect(result.usage.costUsd).toBeCloseTo(.006);expect(result.dropped[0].reason).not.toContain('last reply began');
});

it.each([new BriefingModelError('Provider timeout',true,true),new BriefingModelError('Provider unavailable',true,false),new BriefingBudgetError('Not admitted'),new Error('CALL_ALREADY_STARTED_OR_UNKNOWN'),new Error('SCOPE_DENIED')])('does not isolate provider/accounting failure %s during coverage correction',async error=>{
 const x=scripted({edit:[{items:[draft('Road reopened',['S2']),draft(original)]}],verify:[{results:[{i:0,verdict:'ok',issues:[]},{i:1,verdict:'fix',issues:[countIssue]}]},{results:[{i:0,verdict:'ok',issues:[]}]}],repair:[{items:[{i:0,headline:safe,body:'',drop:false}]}],recovery_coverage:['not JSON',()=>{throw error}]});
 await expect(generateBriefing({...input,articles:[...input.articles,article('road','The municipality reopened the coastal road.')]},x.port,MODELS)).rejects.toBe(error);
 expect(x.calls.filter(c=>c.stage==='recovery_coverage')).toHaveLength(2);
});


it('continues coverage checking other repaired batches after one batch exhausts malformed replies',async()=>{
 const x=scripted({edit:[{items:[draft('Road reopened',['S2']),draft(original),draft('School opened',['S3'])]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]},{results:[{i:0,verdict:'fix',issues:[countIssue]}]},{results:[{i:0,verdict:'fix',issues:['Retain inspection qualification']}]},{results:[{i:0,verdict:'ok',issues:[]}]},{results:[{i:0,verdict:'ok',issues:[]}]}],repair:[{items:[{i:0,headline:safe,body:'',drop:false},{i:1,headline:'School reopened after inspection',body:'',drop:false}]}],recovery_coverage:['not JSON','not JSON',{results:[{i:0,status:'preserved',reason:'The reopening and inspection remain.',developments:[{sourceRef:'S3',sourceQuote:'The school reopened after its safety inspection.',readerQuote:'School reopened after inspection'}]}]}]});
 const result=await generateBriefing({...input,articles:[...input.articles,article('road','The municipality reopened the coastal road.'),article('school','The school reopened after its safety inspection.')]},x.port,MODELS,{maxVerifyChars:1});
 expect(result.items.map(i=>i.sourceIds)).toEqual([['road'],['school']]);expect(result.dropped).toEqual([expect.objectContaining({carry:true,sourceIds:['army']})]);expect(x.calls.filter(c=>c.stage==='recovery_coverage')).toHaveLength(3);
});

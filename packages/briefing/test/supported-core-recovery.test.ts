import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {article,FEED,MODELS,scripted,WINDOW} from './helpers';

// Source-derived development case, not an untouched test or paid-model result.
// The 17 Nov retained army statement distinguishes a wanted suspect, three
// Lebanese, one Palestinian and 123 Syrians; the last group's stated grounds
// must not be attached to every detainee. These fixtures paraphrase that case.
const source='The army arrested a wanted suspect in Rehab, Baabda for kidnapping, armed robbery, shooting and drug trafficking. It also detained three Lebanese for unlicensed pistols, one Palestinian for failing to obey checkpoint orders, and 123 Syrians for illegal entry and lack of legal papers. Investigations are supervised by the competent judiciary.';
const draft=(headline:string,refs=['S1'])=>({headline,body:'',sources:refs,relation:'new',updates:null,importance:1});
const original='Army arrests wanted suspect and detains 126 others';
const attempted='Army detains 127 people including 123 Syrians for illegal entry';
const safe='Army reports arresting a wanted suspect in Rehab, Baabda';
const countIssue='The source describes 127 others, not 126 others.';
const scopeIssue='Do not imply that all detainees were arrested for illegal entry.';
const input={feed:{...FEED,interest:'Lebanese security developments',verificationRecoveryPolicy:'supported-core-v1' as const},...WINDOW,articles:[article('army',source)]};

it('supplies the full failed-repair history and uses the last existing repair for a supported core, still requiring verification',async()=>{
 const x=scripted({edit:[{items:[draft(original)]}],verify:[{results:[{i:0,verdict:'fix',issues:[countIssue]}]},{results:[{i:0,verdict:'fix',issues:[scopeIssue]}]},{results:[{i:0,verdict:'ok',issues:[]}]}],repair:[{items:[{i:0,headline:attempted,body:'',drop:false}]},{items:[{i:0,headline:safe,body:'',drop:false}]}]});
 const result=await generateBriefing(input,x.port,MODELS);
 expect(result.status).toBe('published');expect(result.items[0]).toMatchObject({headline:safe,sourceIds:['army']});
 const repairs=x.calls.filter(c=>c.stage==='repair');
 expect(repairs[0].request.user).toContain('REPAIR HISTORY');expect(repairs[0].request.user).not.toContain('FINAL SUPPORTED-CORE REPAIR');
 expect(repairs[1].request.user).toContain('FINAL SUPPORTED-CORE REPAIR');
 for(const text of [original,attempted,countIssue,scopeIssue,source])expect(repairs[1].request.user).toContain(text);
 expect(repairs[1].request.system).toContain('Do not infer an overall total');
 expect(x.calls.filter(c=>c.stage==='verify').every(c=>c.request.system.includes('Do not treat a supported subset as a false total'))).toBe(true);
 expect(x.calls.map(c=>c.stage)).toEqual(['edit','verify','repair','verify','repair','verify']);
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
 const candidate=scripted(replies());await generateBriefing(input,candidate.port,MODELS);
 expect(legacy.calls[0].request).toEqual(candidate.calls[0].request);
 expect(legacy.calls[1].request.system).not.toContain('SUPPORTED-CORE VERIFICATION');
 expect(legacy.calls[2].request.user).not.toContain('REPAIR HISTORY');
 expect(candidate.calls[2].request.user).toContain('REPAIR HISTORY');
});

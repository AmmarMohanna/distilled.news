import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import retained from './fixtures/v3-recombined-prior.json';
import {generateBriefing} from '../src/engine';
import {EDITOR_SYSTEM_V4,VERIFY_SYSTEM} from '../src/prompts';
import {scripted,article,FEED,MODELS,WINDOW} from './helpers';
const input={feed:{interest:'Important developments affecting Lebanon',language:'ar' as const,windowMinutes:60},windowStart:retained.windowStart,windowEnd:retained.windowEnd,prior:retained.prior,articles:retained.articles};
const repeat={...retained.repeatedItem,sources:retained.articles.map((_,i)=>'S'+(i+1)),updates:null};
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
it('retains the exact failing baseline prompts and honestly reproduces its false approval',async()=>{
 expect(sha(EDITOR_SYSTEM_V4)).toBe(retained.recorded.editorSystemSha256);expect(sha(VERIFY_SYSTEM)).toBe(retained.recorded.verifierSystemSha256);
 const {port,calls}=scripted({edit:[{items:[repeat]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
 const result=await generateBriefing(input,port,MODELS,{promptVersion:4});expect(result.items).toHaveLength(1);expect(retained.expectedVerdict).toBe('redundant');
 const priorPart=calls[0].request.user.split('ALREADY TOLD TO THE READER:')[1].split('NEW ARTICLES')[0];
 for(const p of retained.prior)expect(priorPart).toContain(p.headline);
});
it('version 5 changes only the shared novelty instruction, preserving request evidence and models',async()=>{
 const capture=async(promptVersion:4|5)=>{const scriptedPort=scripted({edit:[{items:[repeat]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});await generateBriefing(input,scriptedPort.port,MODELS,{promptVersion});return scriptedPort.calls;};
 const baseline=await capture(4),candidate=await capture(5);
 expect(candidate.map(c=>c.stage)).toEqual(['edit','verify']);
 for(let i=0;i<2;i++){expect(candidate[i].request.user).toBe(baseline[i].request.user);expect(candidate[i].request.model).toBe(baseline[i].request.model);expect(candidate[i].request.maxTokens).toBe(baseline[i].request.maxTokens);expect(candidate[i].request.system).toContain('the union of all ALREADY TOLD items');expect(candidate[i].request.system.startsWith(baseline[i].request.system)).toBe(true);}
});
it('a redundant finding drops the repeat without repair or carrying it into another briefing (scripted contract only)',async()=>{
 const {port,calls}=scripted({edit:[{items:[repeat]}],verify:[{results:[{i:0,verdict:'redundant',issues:['Already covered across prior-0 and prior-1.']}]}]});
 const result=await generateBriefing(input,port,MODELS,{promptVersion:5});expect(result.items).toEqual([]);expect(result.dropped[0].carry).toBe(false);expect(calls.map(c=>c.stage)).toEqual(['edit','verify']);
});
it.each(['update','correction','new'] as const)('does not mechanically suppress a supported %s based on shared vocabulary (scripted contract only)',async relation=>{
 const body=relation==='update'?'The council approved the previously proposed bridge repairs.':relation==='correction'?'The council corrected its estimate from 10 bridges to 8.':'A different bridge closed after a separate inspection.';
 const {port,calls}=scripted({edit:[{items:[{headline:body,body:'',sources:['S1'],relation,updates:relation==='new'?null:'prior',importance:1}]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
 const result=await generateBriefing({feed:FEED,...WINDOW,prior:[{id:'prior',at:WINDOW.windowStart,headline:'Council proposes repairs to 10 bridges',body:'Approval is pending.'}],articles:[article('source',body)]},port,MODELS,{promptVersion:5,now:()=>new Date(WINDOW.windowEnd)});expect(result.items).toHaveLength(1);expect(result.items[0].relation).toBe(relation);expect(calls).toHaveLength(2);
});

import {expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {EDITOR_SYSTEM_V4,VERIFY_SYSTEM,REPAIR_SYSTEM} from '../src/prompts';
import {WORDING_FIDELITY_V2,VERIFY_WORDING_FIDELITY_V2} from '../src/wording-fidelity';
import {article,FEED,MODELS,scripted,WINDOW} from './helpers';
const policy='faithful-compression-v2' as const;
const draft=(headline:string)=>({headline,body:'',sources:['S1'],relation:'new',updates:null,importance:1});

it('leaves unmarked frozen editor and verifier request bytes unchanged',async()=>{
 const x=scripted({edit:[{items:[draft('A supported development')]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
 await generateBriefing({feed:FEED,...WINDOW,articles:[article('a','A supported development was reported by the authorities.')]},x.port,MODELS);
 expect(x.calls.map(c=>c.request.system)).toEqual([EDITOR_SYSTEM_V4,VERIFY_SYSTEM]);
});
it.each([
 ['ar','تنوع غير مسبوق في الفرق المتأهلة','قد تكون من أكثر التشكيلات تنوعاً','This could be one of the most varied playoff fields in history.','Do not turn one of the most into unprecedented.'],
 ['ar','إيزنكوت يرفض تشكيل حكومة وحدة','إيزنكوت يصف الدعوة بأنها مناورة مع استمرار المحادثات','Eisenkot called the appeal a bluff but confirmed the parties were discussing the proposal.','Calling an appeal a bluff is not a final rejection of the proposed coalition.'],
 ['fr','Tous les sites fermeront','Certains sites pourraient fermer','Some sites could close; no final decision has been made.','Restore some and could.'],
 ['en','The company ends negotiations','The company criticises a condition while talks continue','The company criticised one condition and confirmed that negotiations continued.','Criticising a condition does not mean ending negotiations.']
] as const)('routes a %s factual-strengthening problem through targeted repair and re-verification',async(language,bad,good,source,issue)=>{
 const x=scripted({edit:[{items:[draft(bad)]}],verify:[{results:[{i:0,verdict:'fix',issues:[issue]}]},{results:[{i:0,verdict:'ok',issues:[]}]}],repair:[{items:[{i:0,headline:good,body:'',drop:false}]}]});
 const result=await generateBriefing({feed:{...FEED,language,wordingFidelityPolicy:policy},...WINDOW,articles:[article('a',source)]},x.port,MODELS);
 expect(result.items[0].headline).toBe(good);expect(result.items[0].sourceIds).toEqual(['a']);
 expect(x.calls.map(c=>c.stage)).toEqual(['edit','verify','repair','verify']);
 expect(x.calls[0].request.system).toBe(EDITOR_SYSTEM_V4+'\n\n'+WORDING_FIDELITY_V2);
 expect(x.calls[1].request.system).toBe(VERIFY_SYSTEM+'\n\n'+VERIFY_WORDING_FIDELITY_V2);
 expect(x.calls[2].request.system).toBe(REPAIR_SYSTEM+'\nReturn body:"" when the headline alone preserves the supported development and all essential qualifications.'+'\n\n'+WORDING_FIDELITY_V2);
 expect(x.calls[2].request.user).toContain(issue);expect(x.calls[3].request.user).toContain(good);
});
it('keeps supported concise wording on the ordinary two-call path',async()=>{
 const headline='Talks continue despite criticism';
 const x=scripted({edit:[{items:[draft(headline)]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
 const result=await generateBriefing({feed:{...FEED,wordingFidelityPolicy:policy},...WINDOW,articles:[article('a','The parties criticised one another but confirmed talks were continuing.')]},x.port,MODELS);
 expect(result.items[0]).toMatchObject({headline,body:''});expect(x.calls).toHaveLength(2);
});
it('applies fidelity rules to consolidation as well as independent drafts',async()=>{
 const x=scripted({edit:[{items:[draft('Talks continue')]},{items:[{...draft('The parties criticise one another'),sources:['S2']}]}],consolidate:[{items:[{from:[0,1],headline:'Talks continue despite criticism',body:'',relation:'new',updates:null,importance:1}],cut:[]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
 const result=await generateBriefing({feed:{...FEED,wordingFidelityPolicy:policy},...WINDOW,articles:[article('a','Both parties confirmed that talks continue.'),article('b','Both parties criticised one another during the talks.')]},x.port,MODELS,{maxEditorChars:1});
 expect(result.items).toHaveLength(1);expect(x.calls.find(c=>c.stage==='consolidate')!.request.system).toContain(WORDING_FIDELITY_V2);
});

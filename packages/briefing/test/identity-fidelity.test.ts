import {expect,it} from 'vitest';
import {arabicIdentityIssues} from '../src/identity-fidelity';
import {generateBriefing} from '../src/engine';
import {article,FEED,MODELS,scripted,WINDOW} from './helpers';

const source='الرئيس جوزيف عون، في مقابلة مطولة، قال إن الدولة اتخذت قرارها بحصرية السلاح.';
it.each([
 ['أعلن الرئيس عبد الفتاح الوحش قراراً.','أعلن الرئيس عبد الفتاح السيسي قراراً.'],
 ['قال رئيس الحكومة عبد الله بن قنديل إن القرار اتخذ.','قال رئيس الحكومة عبد الله بن سالم إن القرار اتخذ.'],
 ['أعلن الرئيس «عبد الفتاح الوحش» القرار.','أعلن الرئيس «عبد الفتاح السيسي» القرار.'],
])('checks the final surname of the whole multi-token name: %s',(reader,evidence)=>{
 expect(arabicIdentityIssues(reader,[evidence])).toEqual([expect.objectContaining({code:'ARABIC_NAME_UNBOUND'})]);
});
it('does not silently skip an invented name whose surname is completely absent',()=>{
 expect(arabicIdentityIssues('أعلن رئيس الحكومة نجيب قنديل تأجيل الجلسة.',['أعلنت رئاسة الحكومة تأجيل الجلسة بسبب ظرف عائلي طرأ على سلام.'])).toEqual([expect.objectContaining({code:'ARABIC_NAME_UNBOUND',name:'نجيب قنديل'})]);
});
it('reports cross-language transliteration as unresolved rather than an Arabic-source mismatch or a pass',()=>{
 expect(arabicIdentityIssues('قال الرئيس عبد الفتاح السيسي إن القرار اتخذ.',['President Abdel Fattah el-Sisi announced the decision.'])).toEqual([expect.objectContaining({code:'ARABIC_TRANSLITERATION_UNRESOLVED'})]);
});
it('does not certify a truncated shared prefix as the full identity',()=>{
 expect(arabicIdentityIssues('قال الرئيس عبد الفتاح إن القرار اتخذ.',['قال الرئيس عبد الفتاح السيسي إن القرار اتخذ.'])).not.toEqual([]);
});
it('abstains when unfamiliar trailing Arabic prose leaves the name boundary ambiguous',()=>{
 const reader='الرئيس أحمد محمد علي تتوالى تفاصيل محلية';
 const issues=arabicIdentityIssues(reader,['الرئيس أحمد محمد علي، في بيان اليوم.']);
 expect(issues).toEqual([expect.objectContaining({code:'ARABIC_NAME_BOUNDARY_UNCERTAIN'})]);
});
it('does not certify a truncated prefix before an unexpected name separator',()=>{
 expect(arabicIdentityIssues('أعلن الرئيس عبد-الفتاح الوحش القرار.',['أعلن الرئيس عبد-الفتاح السيسي القرار.'])).toEqual([expect.objectContaining({code:'ARABIC_NAME_BOUNDARY_UNCERTAIN'})]);
});
it.each([
 ['أعلن الرئيس عبد الفتاح السيسي قراراً.','أعلن الرئيس عبد الفتاح السيسي قراراً.'],
 ['قال رئيس الحكومة عبد الله بن سالم إن القرار اتخذ.','قال رئيس الوزراء عبد الله بن سالم إن القرار اتخذ.'],
 ['الرئيس عبد الفتاح السيسي','الرئيس عبد الفتاح السيسي، قال إن القرار اتخذ.'],
 ['قال الرئيس السيسي إن القرار اتخذ.','الرئيس عبد الفتاح السيسي، قال إن القرار اتخذ.'],
])('preserves source-bound multi-token names and supported surname abbreviations: %s',(reader,evidence)=>{
 expect(arabicIdentityIssues(reader,[evidence])).toEqual([]);
});
it.each([
 ['أعلن رئيس الحكومة نجيب قنديل تأجيل الجلسة','أعلنت رئاسة الحكومة تأجيل الجلسة لظرف عائلي طرأ على سلام.'],
 ['أعلن الرئيس عبد الفتاح الوحش قراراً','أعلن الرئيس عبد الفتاح السيسي قراراً.'],
])('withholds an unbound complete name despite an approving verifier and preserves its sibling: %s',async(headline,evidence)=>{
 const draft=(headline:string,sources:string[])=>({headline,body:'',sources,relation:'new',updates:null,importance:1});
 const x=scripted({edit:[{items:[draft(headline,['S1']),draft('أعلنت البلدية افتتاح الحديقة',['S2'])]}],verify:[{results:[{i:0,verdict:'ok',issues:[]},{i:1,verdict:'ok',issues:[]}]}]});
 const result=await generateBriefing({feed:{...FEED,language:'ar',identityFidelityPolicy:'arabic-person-role-v1'},...WINDOW,articles:[article('a',evidence),article('b','أعلنت البلدية افتتاح الحديقة.')]},x.port,MODELS,{maxRepairs:0,prepare:{minChars:1}});
 expect(result.items.map(i=>i.headline)).toEqual(['أعلنت البلدية افتتاح الحديقة']);
 expect(result.dropped[0]).toMatchObject({carry:true,sourceIds:['a']});
});
it('detects the retained Arabic role substitution without outside biographical knowledge',()=>{
 expect(arabicIdentityIssues('قال قائد الجيش جوزيف عون إن الدولة اتخذت قرارها.',[source])).toEqual([expect.objectContaining({code:'ARABIC_ROLE_UNBOUND',name:'جوزيف عون'})]);
});
it('detects unsupported full-name expansion from surname-only evidence',()=>{
 expect(arabicIdentityIssues('ظرف عائلي لرئيس الحكومة نجيب سلام',['رئاسة الحكومة: لن تعقد جلسة هذا الأسبوع بسبب ظرف عائلي خاص طرأ على سلام.'])).toEqual([expect.objectContaining({code:'ARABIC_NAME_UNBOUND',name:'نجيب سلام'})]);
});
it.each([
 ['قال رئيس الجمهورية جوزيف عون إن القرار اتخذ.',source],
 ['قال الرئيس جوزاف عون إن القرار اتخذ.','رئيس الجمهورية جوزاف عون قال إن القرار اتخذ.'],
 ['قال الرئيس جوزاف عون إن القرار اتخذ.','رئيس الجمهورية جوزيف عون قال إن القرار اتخذ.'],
 ['لا جلسة بسبب ظرف عائلي خاص طرأ على سلام.','لن تعقد جلسة بسبب ظرف عائلي خاص طرأ على سلام.'],
 ['قال رئيس الحكومة نواف سلام إن الزيارة انتهت.','رئيس مجلس الوزراء نواف سلام قال إن الزيارة انتهت.'],
 ['قال الرئيس عون إن القرار اتخذ.',source],
 ['قال الرئيس الفرنسي إيمانويل ماكرون إن الزيارة انتهت.','الرئيس الفرنسي إيمانويل ماكرون أعلن انتهاء الزيارة.'],
 ['قال قائد الجيش جوزيف عون إن القرار اتخذ.','قال قائد الجيش جوزيف عون إن القرار اتخذ.'],
 ['الرئيس التنفيذي سام ألتمان أعلن النموذج.','أعلن سام ألتمان، الرئيس التنفيذي، النموذج.'],
 ['رئيس الحكومة السابق نجيب ميقاتي تحدث عن الزيارة.','تحدث نجيب ميقاتي، رئيس الحكومة السابق، عن الزيارة.'],
 ['رئيس الحكومة بنيامين نتنياهو أعلن القرار.','رئيس الوزراء الإسرائيلي بنيامين نتنياهو أعلن القرار.'],
])('preserves supported wording and surname-only identification: %s',(reader,evidence)=>{
 expect(arabicIdentityIssues(reader,[evidence])).toEqual([]);
});
it('does not bind a role from a different person or another source fragment',()=>{
 expect(arabicIdentityIssues('قال قائد الجيش جوزيف عون إن القرار اتخذ.',['الرئيس جوزيف عون قال ذلك. قائد الجيش رودولف هيكل حضر.'])).not.toEqual([]);
});
it('still detects a role change across the observed Joseph spelling variants',()=>{
 expect(arabicIdentityIssues('قال قائد الجيش جوزاف عون إن القرار اتخذ.',[source])).toEqual([expect.objectContaining({code:'ARABIC_ROLE_UNBOUND'})]);
});
it('does not borrow an unsupported identity from prior reader history',async()=>{
 const headline='رئيس الحكومة نجيب سلام يعلن تأجيل جلسة';
 const x=scripted({edit:[{items:[{headline,body:'',sources:['S1'],relation:'new',updates:null,importance:1}]}],verify:[{results:[{i:0,verdict:'ok',issues:[]}]}]});
 const result=await generateBriefing({feed:{...FEED,language:'ar',identityFidelityPolicy:'arabic-person-role-v1'},...WINDOW,articles:[article('a','أعلنت رئاسة الحكومة تأجيل جلسة بسبب ظرف عائلي طرأ على سلام.')],prior:[{id:'old',at:WINDOW.windowStart,headline,body:''}]},x.port,MODELS,{maxRepairs:0});
 expect(result.items).toEqual([]);expect(result.dropped[0]).toMatchObject({carry:true,sourceIds:['a']});
});
it('repairs a model-approved wrong role and preserves an unrelated approved sibling',async()=>{
 const bad='قائد الجيش جوزيف عون يعلن القرار',good='الرئيس جوزيف عون يعلن القرار';
 const draft=(headline:string,sources=['S1'])=>({headline,body:'',sources,relation:'new',updates:null,importance:1});
 const x=scripted({edit:[{items:[draft(bad),draft('أعلنت البلدية افتتاح الحديقة',['S2'])]}],verify:[{results:[{i:0,verdict:'ok',issues:[]},{i:1,verdict:'ok',issues:[]}]},{results:[{i:0,verdict:'ok',issues:[]}]}],repair:[{items:[{i:0,headline:good,body:'',drop:false}]}]});
 const result=await generateBriefing({feed:{...FEED,language:'ar',identityFidelityPolicy:'arabic-person-role-v1'},...WINDOW,articles:[article('a',source),article('b','أعلنت البلدية افتتاح الحديقة.')]},x.port,MODELS,{prepare:{minChars:1}});
 expect(result.items.map(x=>x.headline)).toEqual([good,'أعلنت البلدية افتتاح الحديقة']);
 expect(x.calls.find(c=>c.stage==='repair')?.request.user).toContain('ARABIC_ROLE_UNBOUND');
});

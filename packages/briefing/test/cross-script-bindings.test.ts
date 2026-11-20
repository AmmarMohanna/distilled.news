import{expect,it}from'vitest';
import{parseBoundReview,parseReaderInventory}from'../src/source-bound-claims';
const muhammad='\u0645\u062d\u0645\u062f \u0639\u0644\u064a',johnArabic='\u062c\u0648\u0646 \u0633\u0645\u064a\u062b',engineer='\u0645\u0647\u0646\u062f\u0633',president='\u0631\u0626\u064a\u0633';
function assess(personName:string,sourceName:string,roleSurface:string,sourceRole:string,independent:boolean){
 const headline=`${roleSurface} ${personName} approved.`.trim(),text=`${sourceRole} ${sourceName} approved.`.trim(),items=[{headline,body:'',refs:['S1']}];
 const inventory=parseReaderInventory({units:[{id:'I0.H',facets:[{id:'F',quote:headline,claim:headline,kind:'identity',personName,...(roleSurface?{roleSurface}:{})}]}]},items);
 return parseBoundReview({results:[{i:0,inventory:'complete',verdict:'ok',issues:[],facets:[{id:'F',support:'supported',sourcePersonName:sourceName,sourceRoleSurface:sourceRole,evidence:[{source:'S1',quote:text}],explanation:'The final model assumes this identity and role are equivalent.'}]}]},items,[{ref:'S1',text}],inventory,[],independent?[{source:'S1',name:sourceName,role:sourceRole}]:undefined).get(0)!;
}
for(const independent of [false,true]){
 it.each([[muhammad,'John Smith'],['John Smith',muhammad],[muhammad,'Jean Dupont'],['Jean Dupont',muhammad],['John Smith','Jean Dupont'],['Jean Dupont','John Smith']])(`rejects different people despite model approval (independent=${independent}): %s / %s`,(reader,source)=>expect(assess(reader,source,'','',independent).verdict).toBe('fix'));
 it.each([[engineer,'President'],['President',engineer],[engineer,'Ministre'],['Ministre',president],['Engineer','President'],['Ministre','Engineer']])(`rejects different roles despite model approval (independent=${independent}): %s / %s`,(reader,source)=>expect(assess('John Smith','John Smith',reader,source,independent).verdict).toBe('fix'));
 it(`does not claim equivalence for plausible but unverified transliteration (independent=${independent})`,()=>{const result=assess(johnArabic,'John Smith','','',independent);expect(result.verdict).toBe('fix');expect(result.issues.join(' ')).toContain('CROSS_SCRIPT_IDENTITY_UNRESOLVED')});
 it(`keeps cross-script role uncertainty distinct from a proven factual error (independent=${independent})`,()=>{const result=assess('John Smith','John Smith',president,'President',independent);expect(result.verdict).toBe('fix');expect(result.issues.join(' ')).toContain('CROSS_SCRIPT_ROLE_UNRESOLVED')});
 it.each([['John Smith','President'],['Jean Dupont','Ministre'],[muhammad,president]])(`preserves directly supported names and roles (independent=${independent}): %s`,(name,role)=>expect(assess(name,name,role,role,independent).verdict).toBe('ok'));
}

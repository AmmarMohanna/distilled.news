import {it,expect} from 'vitest';
import {witnessedApprovedHistory} from './reader-history';
it('verified context facts from another Event remain reader-known only with approved, occurrence-bound published witnesses',()=>{
 const own={id:'own',text:'Cedar University opened a clinical trial.',evidenceRevisionIds:['revision'],selfContained:'YES'},context={id:'context',text:'Science Corporation implants its vision-restoring chip in its first Stargardt disease patient.',evidenceRevisionIds:['revision'],selfContained:'YES'};
 const candidate={facts:[own],evidenceRevisionIds:['revision']},shortlist={candidates:[candidate,{facts:[context],evidenceRevisionIds:['revision']}]};
 const plan={newUnderstandingFactIds:['own'],contextFactIds:['context'],mustIncludeFactIds:['own'],attributionFactIds:[],certaintyFactIds:[],disagreementFactIds:[],openQuestionFactIds:[]};
 const text='Science Corporation has implanted its vision-restoring chip in its first patient with Stargardt disease. Cedar University opened a clinical trial.',story={candidateId:'published-story',claims:[{id:'claim',text}]};
 const check={candidateId:'published-story',factId:'context',communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,nonRepetitive:true,reason:'Grounded source paraphrase is present in published prose.',readerSpans:[{claimId:'claim',text}]};
 const recover=(checks:any[],approved:any=plan)=>witnessedApprovedHistory(candidate as any,shortlist as any,approved,checks,story).map(f=>f.id);
 expect(recover([check])).toEqual(['context']);
 expect(recover([{...check,candidateId:'another-story'}])).toEqual([]);
 expect(recover([{...check,communicated:false}])).toEqual([]);
 expect(recover([{...check,readerSpans:[{claimId:'other-claim',text}]}])).toEqual([]);
 expect(recover([check],{...plan,contextFactIds:[]})).toEqual([]);
});

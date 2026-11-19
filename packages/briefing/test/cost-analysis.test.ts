import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {analyzeGenerationCost} from '../../../evaluation/briefing-quality/analyze-generation-cost';
const temporary:string[]=[];
afterEach(()=>{for(const dir of temporary.splice(0))rmSync(dir,{recursive:true,force:true})});
function run(outcome:unknown){
 const dir=mkdtempSync(join(tmpdir(),'dn-cost-analysis-'));temporary.push(dir);
 const write=(name:string,value:unknown)=>writeFileSync(join(dir,name),JSON.stringify(value));
 const request={model:'m',system:'You are the editor of a personal news briefing.',user:'Untrusted plain-text reader interest.',maxTokens:10};
 const rows=[{id:'one',caseId:'sample',system:'engine',state:'RESERVED',hash:createHash('sha256').update(JSON.stringify(request)).digest('hex')},{id:'one',state:'SETTLED',generationId:'gen-one',costUsd:.01}];
 write('sample.engine.outcome.json',outcome);write('historical-writers.json',[]);write('one.request.json',request);write('one.response.json',{id:'gen-one',usage:{cost:.01}});
 writeFileSync(join(dir,'ledger.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n'));
 return ()=>analyzeGenerationCost(dir,'sample');
}
it('counts reconciled stages only for an actually completed matching execution',()=>{
 const result=run({caseId:'sample',system:'engine',engineResult:{status:'published',items:[]}});
 expect(result().originalExecutionReceiptCostUsd).toBe(.01);
});
it.each([
 {caseId:'sample',system:'engine',error:'failed after payment'},
 {caseId:'sample',system:'engine',engineResult:{status:'failed'}},
 {caseId:'other',system:'engine',engineResult:{status:'published'}},
 {caseId:'sample',system:'evaluation',engineResult:{status:'published'}},
])('never labels a failed or mismatched outcome successful: %j',outcome=>{
 expect(run(outcome)).toThrow('A matching successful engine outcome is required');
});

import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {generateBriefing} from '../packages/briefing/src/engine';
import {openAiCompatibleModel, type ModelRequest} from '../packages/briefing/src/model';
import {prepareArticles,selectPrior} from '../packages/briefing/src/prepare';
import {verificationMemory,exactPriorRepeat} from '../packages/briefing/src/novelty';
const dir='.local-reports/novelty-repair/',s=JSON.parse(readFileSync(dir+'input.private.json','utf8'));
const target=s.input.prior.filter((p:any)=>/G7 foreign ministers|illegal internet/.test(p.headline));
const oldMemory=selectPrior(s.input.prior,prepareArticles(s.input.articles,{minChars:1,nearDuplicate:1.01,maxArticleChars:Number.MAX_SAFE_INTEGER}).prepared,new Date(s.input.windowEnd));
const newMemory=verificationMemory(s.input.prior,target.map((p:any)=>({headline:p.headline.split('\n')[0],body:p.body})),new Date(s.input.windowEnd));
if(!target.every((p:any)=>newMemory.some(n=>n.id===p.id)))throw Error('TARGET_MEMORY_NOT_RETRIEVED');
const varsFile=process.env.DISTILLED_EVALUATION_VARS_FILE;if(!varsFile)throw Error('EXPLICIT_STAGING_VARS_FILE_REQUIRED');
if(process.env.NOVELTY_REPLAY_AUTHORITY!=='APPROVED_REAL_DATA_MAX_2_USD')throw Error('EXPLICIT_PAID_AUTHORITY_REQUIRED');
const vars=readFileSync(varsFile,'utf8');
const key=vars.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/m)?.[1].replace(/^(['"])(.*)\1$/,'$2');if(!key)throw Error('KEY_MISSING');
const path=dir+'live-ledger-v2.json';if(existsSync(path))throw Error('EXISTING_PAID_RUN_DO_NOT_REPLAY');
const previous=JSON.parse(readFileSync(dir+'live-ledger.json','utf8'));
const ledger:any={budgetUsd:2,spentUsd:previous.spentUsd,reservedUsd:previous.reservedUsd,calls:[],cases:[],memory:{old:target.map((p:any)=>({headline:p.headline.split('\n')[0],included:oldMemory.some(n=>n.id===p.id)})),new:target.map((p:any)=>({headline:p.headline.split('\n')[0],included:newMemory.some(n=>n.id===p.id)}))}};
const save=()=>writeFileSync(path,JSON.stringify(ledger,null,2));save();
const transport=openAiCompatibleModel({url:'https://openrouter.ai/api/v1/chat/completions',apiKey:key,retries:0,reportCost:true});
const port={async complete(request:ModelRequest){
 const expensive=request.model==='openai/gpt-4.1',ceiling=((request.system.length+request.user.length)*(expensive?2:.4)+request.maxTokens*(expensive?8:1.6))/1e6;
 if(ledger.spentUsd+ledger.reservedUsd+ceiling>2)throw Error('BUDGET_LIMIT');
 const row:any={index:ledger.calls.length,model:request.model,ceiling,state:'RESERVED'};ledger.calls.push(row);ledger.reservedUsd+=ceiling;save();
 writeFileSync(dir+`v2-call-${row.index}.private.json`,JSON.stringify(request));
 try{const response=await transport.complete(request);if(response.costUsd===undefined)throw Error('UNCONFIRMED_COST');row.state='SETTLED';row.costUsd=response.costUsd;ledger.spentUsd+=response.costUsd;ledger.reservedUsd-=ceiling;writeFileSync(dir+`v2-response-${row.index}.private.json`,JSON.stringify(response));save();return response;}catch(error){row.state='UNKNOWN_STOP';save();throw error;}
}};
const articles=s.input.articles.filter((a:any)=>/323684|967272|967287|967302/.test(a.url??''));if(!articles.length)throw Error('REAL_EVIDENCE_MISSING');
// Source texts are retained real articles; the candidate must reject both old developments.
for(const noveltyGuard of [true]){
 const input={...s.input,articles,prior:noveltyGuard?s.input.prior:oldMemory};
 const result=await generateBriefing(input,port,s.models,{noveltyGuard,promptVersion:4,now:()=>new Date(s.input.windowEnd),prepare:{minChars:1,nearDuplicate:1.01,maxArticleChars:Number.MAX_SAFE_INTEGER}});
 ledger.cases.push({name:noveltyGuard?'real-candidate':'real-baseline',articles:articles.length,result});save();
}
const control={...s.input,prior:[{id:'proposal',at:s.input.windowStart,headline:'The authority proposes transferring illegal internet users within three months',body:'The proposal has not been adopted.'}],articles:[{id:'control',source:'synthetic-regression-control',publishedAt:s.input.windowStart,title:'Proposal adopted with changed deadline',text:'The authority has now formally adopted the previously proposed transfer of illegal internet users to licensed networks. Its final decision changes the deadline from three months to six months. The earlier proposal had not been adopted.'}]};
const result=await generateBriefing(control,port,s.models,{noveltyGuard:true,promptVersion:4,now:()=>new Date(s.input.windowEnd)});ledger.cases.push({name:'material-update-control',result});save();
const real=ledger.cases.find((c:any)=>c.name==='real-candidate').result;
const passed=real.items.length===0&&result.items.length>0&&target.every((p:any)=>exactPriorRepeat({headline:p.headline.split('\n')[0],body:p.headline.split('\n').slice(1).join('\n')},s.input.prior));
ledger.passed=passed;save();console.log(JSON.stringify({passed,costUsd:ledger.spentUsd,calls:ledger.calls.length,cases:ledger.cases.map((c:any)=>({name:c.name,items:c.result.items.map((i:any)=>i.headline),dropped:c.result.dropped}))},null,2));
if(!passed)throw Error('LIVE_REGRESSION_FAILED');

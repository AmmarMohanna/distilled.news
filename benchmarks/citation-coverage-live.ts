import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {completeStorySources} from '../packages/briefing/src/citation-coverage';
import {prepareArticles} from '../packages/briefing/src/prepare';
import {openAiCompatibleModel,UsageMeter} from '../packages/briefing/src/model';
const file='.local-reports/novelty-repair/citation-live.json';if(existsSync(file))throw Error('PRIOR_RUN_NO_REISSUE');
const previous=JSON.parse(readFileSync('.local-reports/novelty-repair/live-ledger-v2.json','utf8'));
const vars=readFileSync(process.env.DISTILLED_EVALUATION_VARS_FILE!,'utf8'),key=vars.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/m)?.[1].replace(/^(['"])(.*)\1$/,'$2');if(!key)throw Error('KEY_MISSING');
const state:any={spentUsd:previous.spentUsd,reservedUsd:previous.reservedUsd,budgetUsd:2,calls:[]};const save=()=>writeFileSync(file,JSON.stringify(state,null,2));save();
const model=openAiCompatibleModel({url:'https://openrouter.ai/api/v1/chat/completions',apiKey:key,retries:0,reportCost:true});
const port={async complete(request:any){const ceiling=((request.system.length+request.user.length)*2+request.maxTokens*8)/1e6;if(state.spentUsd+state.reservedUsd+ceiling>2)throw Error('BUDGET_LIMIT');state.reservedUsd+=ceiling;state.calls.push({state:'RESERVED',ceiling});save();const response=await model.complete(request);if(response.costUsd===undefined)throw Error('UNKNOWN_COST_STOP');state.reservedUsd-=ceiling;state.spentUsd+=response.costUsd;state.calls.at(-1).state='SETTLED';state.calls.at(-1).cost=response.costUsd;state.calls.at(-1).response=response.text;save();return response;}};
const articles=prepareArticles([
 {id:'a',source:'Outlet A',publishedAt:'2026-11-11T12:00:00Z',text:'The cabinet approved construction of a new airport terminal in the capital. Construction starts in June.'},
 {id:'b',source:'Outlet B',publishedAt:'2026-11-11T12:01:00Z',text:'A new terminal at the capital airport has received cabinet approval, officials announced. Work will begin in June.'},
 {id:'c',source:'Outlet C',publishedAt:'2026-11-11T12:02:00Z',text:'The cabinet discussed a separate proposal to construct a railway station. No approval has been given.'},
 {id:'d',source:'Outlet D',publishedAt:'2026-11-11T12:03:00Z',text:'A second airport terminal in another city remains a proposal awaiting cabinet approval.'}
],{nearDuplicate:1.01}).prepared;
const refs=await completeStorySources(port,new UsageMeter(),'openai/gpt-4.1',[{headline:'Cabinet approves new terminal at capital airport',body:'Construction starts in June.',refs:['S1']}],articles,50000);
state.sources=refs[0].map(ref=>articles.find(a=>a.ref===ref)!.id).sort();state.passed=JSON.stringify(state.sources)===JSON.stringify(['a','b']);save();console.log(JSON.stringify(state));if(!state.passed)throw Error('CITATION_COVERAGE_FAILED');

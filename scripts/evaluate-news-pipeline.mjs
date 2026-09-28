// Bounded product-helper evaluation. Artifacts stay local; credentials never enter output.
import {parseArgs} from 'node:util';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const {values}=parseArgs({options:{base:{type:'string'},owner:{type:'string'},prefix:{type:'string'},tokenFile:{type:'string'},publish:{type:'boolean'},previous:{type:'string'},acknowledge:{type:'string'}}});
if(!values.base||!values.owner||!values.prefix||!/^[a-zA-Z0-9_-]{8,60}$/.test(values.prefix))throw Error('Supply --base, --owner and a safe --prefix');
const url=new URL(values.base);if(url.protocol!=='https:'||url.username||url.password)throw Error('HTTPS base required');
const token=process.env.WEB_OPERATOR_RUNTIME_TOKEN??(values.tokenFile?(await readFile(values.tokenFile,'utf8')).trim():undefined);
if(!token)throw Error('Supply the runtime token through the existing environment or --tokenFile');
const response=await fetch(new URL('/v1/news-pipeline/evaluate',url),{method:'POST',redirect:'error',signal:AbortSignal.timeout(120000),headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({ownerAccountId:values.owner,action:values.acknowledge?'ACKNOWLEDGE':values.publish?'PUBLISH':'READ',...(values.acknowledge?{catchUpId:values.acknowledge}:{})})});
if(!response.ok)throw Error(`PIPELINE_EVALUATION_HTTP_${response.status}`);
const result=await response.json();
const feeds=(result.feeds??[]).map(feed=>({id:feed.feed.id,title:feed.feed.title,developments:feed.developments.length,multiSourceDevelopments:feed.developments.filter(item=>item.sourceCount>1).length,claims:feed.grounding.length,groundedClaims:feed.grounding.filter(claim=>claim.support.length&&claim.support.every(ref=>ref.quotePresent&&/^https?:\/\//.test(ref.url??''))).length,modelCalls:feed.usage.reduce((sum,row)=>sum+row.calls,0),reportedCostUsd:feed.usage.some(row=>row.reportedCostUsd!==null)?feed.usage.reduce((sum,row)=>sum+(row.reportedCostUsd??0),0):null,jobs:feed.jobs,editions:feed.editions.map(edition=>({id:edition.id,sections:edition.sections.length,windowStart:edition.windowStart,windowEnd:edition.windowEnd})),versions:feed.developments.map(item=>({id:item.id,version:item.version})).sort((a,b)=>a.id.localeCompare(b.id))}));
const report={schema:'distilled.news-pipeline.evaluation.v1',proof:'LIVE_PRODUCTION',evaluatedAt:new Date().toISOString(),matrix:feeds,catchUp:result.catchUp,result,groundingLimit:'Exact quotation/reference/number checks and model entailment review are automated; semantic grounding and false merges still require sample review.'};
if(values.previous){const prior=JSON.parse(await readFile(values.previous,'utf8'));report.idempotentRead=JSON.stringify(prior.matrix?.map(row=>({id:row.id,versions:row.versions,modelCalls:row.modelCalls})))===JSON.stringify(feeds.map(row=>({id:row.id,versions:row.versions,modelCalls:row.modelCalls})));}
await mkdir('.local-reports',{recursive:true});const output=resolve('.local-reports',`${values.prefix}-news-pipeline.json`);await writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({output,matrix:feeds,catchUpCards:result.catchUp?.cards.length,idempotentRead:report.idempotentRead,acknowledged:result.ok},null,2));
if(feeds.some(feed=>feed.claims!==feed.groundedClaims))process.exitCode=1;

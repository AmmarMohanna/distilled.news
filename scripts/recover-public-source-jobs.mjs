import {readFile,writeFile} from 'node:fs/promises';

// Operator tool. Dry-run is the default; credentials never enter arguments or output.
const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]};
const manifestPath=value('--manifest'),origin=value('--origin'),envPath=value('--env-file'),output=value('--output');
if(!manifestPath||!origin)throw Error('Use --manifest PATH --origin HTTPS_URL [--execute --env-file PATH --output PATH]');
const url=new URL(origin);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('INVALID_ORIGIN');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
if(typeof manifest.feedId!=='string'||!manifest.feedId||!Array.isArray(manifest.items)||!manifest.items.length||manifest.items.length>50)throw Error('INVALID_MANIFEST');
for(const item of manifest.items)if(typeof item.jobId!=='string'||!item.jobId||! /^[a-zA-Z0-9_-]{1,100}$/.test(item.approvalId)||item.kind&&!['rss','provider'].includes(item.kind))throw Error('INVALID_JOB');
if(!args.includes('--execute')){console.log(JSON.stringify({mode:'dry-run',origin:url.origin,feedId:manifest.feedId,jobs:manifest.items.length}));process.exit(0)}
if(!envPath||!output)throw Error('Execution requires --env-file and --output');
const env=await readFile(envPath,'utf8');const match=env.match(/^\s*INTERNAL_MAINTENANCE_SECRET\s*=\s*(.*?)\s*$/m);
let secret=match?.[1];if(secret?.startsWith('"'))secret=JSON.parse(secret);else if(secret?.startsWith("'"))secret=secret.slice(1,-1);
if(!secret)throw Error('MAINTENANCE_SECRET_MISSING');
const results=[];
for(const item of manifest.items){
 const body={feedId:manifest.feedId,jobId:item.jobId,approvalId:item.approvalId,...(item.kind?{kind:item.kind,...(item.runNow===true?{runNow:true}:{})}:{}),...(item.canonicalEvidence?{canonicalEvidence:item.canonicalEvidence}:{}),...(item.redirectEvidence?{redirectEvidence:item.redirectEvidence}:{})};
 const endpoint=item.kind?'recover-poll-unpaid':'recover-article-unpaid';
 try{
  const response=await fetch(url.origin+'/api/internal/collectors/'+endpoint,{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-distilled-internal':secret},body:JSON.stringify(body),signal:AbortSignal.timeout(200000)});
  const result={...body,title:item.title,status:response.status,result:await response.json()};results.push(result);
  console.log(JSON.stringify({title:item.title,status:response.status,result:result.result}));
 }catch(error){results.push({...body,title:item.title,error:error.name});console.log(JSON.stringify({title:item.title,error:error.name}));}
 await writeFile(output,JSON.stringify({checkedAt:new Date().toISOString(),origin:url.origin,feedId:manifest.feedId,results},null,2));
}

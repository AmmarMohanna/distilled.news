import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';

const args=new Set(process.argv.slice(2));
if([...args].some(arg=>!['--run','--inspect','--approve-usd=0.10'].includes(arg))||(args.has('--run')&&args.has('--inspect')))throw Error('Use no flags for dry-run, --run --approve-usd=0.10 for one authorized trial, or --inspect to inspect its recorded run.');
if(args.has('--run')&&!args.has('--approve-usd=0.10'))throw Error('Explicit $0.10 trial approval is required. No run started.');
const input=JSON.parse(await readFile(new URL('../documentation/google-news-trial.input.json',import.meta.url),'utf8'));
if(input.queries?.length!==1||input.maxItemsPerQuery!==10||input.maxQueries!==1||input.monitoringMode!==false)throw Error('Unexpected trial input; review before spending.');
const endpoint='https://api.apify.com/v2/actors/groupoject~google-news-scraper/runs?maxTotalChargeUsd=0.10&timeout=120&waitForFinish=1';
if(!args.has('--run')&&!args.has('--inspect')){
 console.log(JSON.stringify({mode:'dry-run',actor:'groupoject/google-news-scraper',maxChargeUsd:0.10,recurring:false,input,endpoint},null,2));
}else{
 const directory=new URL('../.review-tmp/google-news-apify-trial/',import.meta.url);
 const journal=new URL('run.json',directory);
 let token=process.env.APIFY_API_TOKEN;
 if(!token){const env=parseEnv(await readFile(new URL('../.env',import.meta.url),'utf8'));token=env.APIFY_API_TOKEN;}
 if(!token)throw Error('APIFY_API_TOKEN is not configured.');
 const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
 const readJson=async response=>{
  const reader=response.body?.getReader();if(!reader)throw Error('Empty provider response');
  const parts=[];let size=0;
  try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>256_000)throw Error('Provider response exceeded limit');parts.push(next.value);}}finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
 };
 if(args.has('--run')){
  if(!args.has('--approve-usd=0.10'))throw Error('Explicit $0.10 trial approval is required. No run started.');
  await mkdir(directory,{recursive:true});
  // Persist intent before the billable request. Existing or uncertain attempts
  // cannot be retried by this script; reconcile in Apify Console instead.
  const record={state:'UNCERTAIN',actor:'groupoject/google-news-scraper',maxChargeUsd:0.10,input,createdAt:new Date().toISOString()};
  await writeFile(journal,JSON.stringify(record,null,2),{flag:'wx'});
  const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(input),signal:AbortSignal.timeout(30_000)});
  if(!response.ok){await response.body?.cancel();throw Error(`Trial start returned HTTP ${response.status}. Intent retained; reconcile before any retry.`);}
  const data=(await readJson(response)).data;
  if(!data?.id||!/^\w+$/.test(data.id))throw Error('Run identity missing. Intent retained; reconcile before retry.');
  await writeFile(journal,JSON.stringify({...record,state:'SUBMITTED',runId:data.id,status:data.status},null,2));
  console.log(JSON.stringify({runId:data.id,status:data.status,maxChargeUsd:0.10,journal:fileURLToPath(journal),next:'Inspect with --inspect; never start another run to poll status.'}));
 }else{
  const record=JSON.parse(await readFile(journal,'utf8'));
  if(!record.runId||!/^\w+$/.test(record.runId))throw Error('No confirmed run ID; reconcile the uncertain attempt in Apify Console.');
  const response=await fetch(`https://api.apify.com/v2/actor-runs/${record.runId}`,{headers,signal:AbortSignal.timeout(15_000)});
  if(!response.ok){await response.body?.cancel();throw Error(`Run inspection returned HTTP ${response.status}`);}
  const data=(await readJson(response)).data;
  const summary={runId:record.runId,status:data?.status,usageTotalUsd:data?.usageTotalUsd??null};
  if(data?.status==='SUCCEEDED'&&/^\w+$/.test(data.defaultDatasetId??'')){
   const result=await fetch(`https://api.apify.com/v2/datasets/${data.defaultDatasetId}/items?format=json&clean=true&limit=10`,{headers,signal:AbortSignal.timeout(15_000)});
   if(!result.ok){await result.body?.cancel();throw Error(`Dataset read returned HTTP ${result.status}`);}
   const rows=await readJson(result);if(!Array.isArray(rows))throw Error('Invalid dataset');
   await writeFile(new URL('dataset.json',directory),JSON.stringify(rows,null,2),{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
   summary.articles=rows.length;summary.sampleTitles=rows.slice(0,3).map(row=>row.title);
  }
  console.log(JSON.stringify(summary,null,2));
 }
}

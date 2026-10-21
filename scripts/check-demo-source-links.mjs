import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {createHash} from 'node:crypto';

// Public GET probes only. No feed creation, credentials, provider jobs or AI calls.
const root=process.cwd();
const catalog=JSON.parse(await fs.readFile('examples/demo-feeds/source-catalog.json','utf8'));
const feeds=JSON.parse(await fs.readFile('examples/demo-feeds/feeds.json','utf8'));
const parserSource=await fs.readFile('packages/connectors/src/rss.ts','utf8');
const compiled=ts.transpileModule(parserSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const parser=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const resume=process.argv[2];
const out=resume?path.resolve(resume):path.join(root,'.local-reports','demo-source-links',stamp);
await fs.mkdir(out,{recursive:true});
const report=resume?JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8')):{startedAt:new Date().toISOString(),scope:'Public endpoint accessibility and real application RSS parsing; social provider collection, authenticated helper, article extraction, relevance and publication not exercised.',datasetHash:createHash('sha256').update(JSON.stringify(catalog)).digest('hex'),feeds:feeds.length,sources:[],articles:[]};
const running=new Map();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url,accept){
 const host=new URL(url).hostname;
 while((running.get(host)??0)>=2)await delay(100);
 running.set(host,(running.get(host)??0)+1);
 const start=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 let result={url,checkedAt:new Date().toISOString()};
 try{
  const r=await fetch(url,{signal:controller.signal,headers:{'user-agent':'DistilledNewsSourceDiagnostic/1.0','accept':accept??'application/rss+xml, application/atom+xml, application/xml, text/html;q=0.8, */*;q=0.5'}});
  Object.assign(result,{status:r.status,finalUrl:r.url,contentType:r.headers.get('content-type'),retryAfter:r.headers.get('retry-after')});
  const chunks=[];let bytes=0;
  for await(const chunk of r.body){bytes+=chunk.length;if(bytes>3*1024*1024){result.truncated=true;break;}chunks.push(chunk);}
  const body=Buffer.concat(chunks).toString('utf8');
  const key=createHash('sha256').update(url+result.checkedAt).digest('hex');
  await fs.writeFile(path.join(out,key+'.body'),body);
  Object.assign(result,{bytes,bodyFile:key+'.body',bodyHash:createHash('sha256').update(body).digest('hex')});
  if(!r.ok)result.error='HTTP_'+r.status;
  else if(/<title[^>]*>[^<]*(just a moment|access denied|attention required|security check|robot check)/i.test(body))result.error='CHALLENGE_PAGE';
  return {result,body};
 }catch(e){Object.assign(result,{error:controller.signal.aborted?'TIMEOUT':e.cause?.code??e.code??'NETWORK_ERROR',detail:String(e.message).slice(0,180)});return {result,body:''};}
 finally{clearTimeout(timer);result.durationMs=Date.now()-start;running.set(host,(running.get(host)??1)-1);}
}
async function mapLimit(items,fn){let next=0;await Promise.all(Array.from({length:8},async()=>{while(next<items.length){const i=next++;await fn(items[i],i);}}));}
if(process.argv[3]==='--retry-errors'){
 report.rechecks=[];
 await mapLimit(report.sources.filter(x=>x.error),async source=>{
  const {result,body}=await get(source.url);
  if(!result.error&&source.kind==='rss_feed'){
   try{result.parsedEntryCount=parser.parseRssFeed(body,{sourceId:'probe',sourceTitle:source.input,sourceUrl:source.url}).length;}catch(e){result.error='FEED_PARSE_ERROR';result.detail=e.message;}
  }
  report.rechecks.push({...result,input:source.input,initialError:source.error});
  if(source.status===406){const html=await get(source.url,'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8');report.rechecks.push({...html.result,input:source.input,initialError:source.error,variant:'HTML_ACCEPT'});}
 });
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({rechecks:report.rechecks.map(x=>({url:x.url,initial:x.initialError,error:x.error,status:x.status,entries:x.parsedEntryCount,variant:x.variant}))}));
 process.exit(0);
}
if(!resume)await mapLimit(catalog.sources,async(source,i)=>{
 let url=source.canonicalUrl;
 if(source.kind==='telegram_channel')url=url.replace('https://t.me/','https://t.me/s/');
 const {result,body}=await get(url);
 Object.assign(result,{input:source.input,kind:source.kind,feedIds:source.feedIds});
 if(['rss_feed','google_news'].includes(source.kind)&&!result.error){
  result.rawEntryCount=(body.match(/<(?:item|entry)(?:\s|>)/gi)??[]).length;
  try{
   const items=(source.kind==='google_news'?parser.parseGoogleNewsRssFeed:parser.parseRssFeed)(body,{sourceId:'probe',sourceTitle:source.input,sourceUrl:url,receivedAt:new Date()});
   result.parsedEntryCount=items.length;
   result.withinRetention=items.filter(x=>Date.parse(x.postedAt)>=Date.now()-15*86400000&&Date.parse(x.postedAt)<=Date.now()+86400000).length;
   result.futureDated=items.filter(x=>Date.parse(x.postedAt)>Date.now()+86400000).length;
   result.sampleItems=items.slice(0,2).map(x=>({text:x.text.slice(0,180),url:x.links[0],postedAt:x.postedAt}));
   if(!items.length)result.error=result.rawEntryCount?'NO_NORMALIZABLE_ITEMS':'EMPTY_FEED';
   else if(!result.withinRetention)result.warning='NO_ITEMS_IN_15_DAY_WINDOW';
  }catch(e){result.error='FEED_PARSE_ERROR';result.detail=e.message;}
 }else if(!['rss_feed','google_news','web_page'].includes(source.kind)){
  result.providerCollection='NOT_TESTED';
  if(source.kind==='telegram_channel')result.visiblePostCount=(body.match(/data-post=/g)??[]).length;
 }
 report.sources.push(result);
 if((i+1)%10===0)console.log(JSON.stringify({phase:'sources',finished:report.sources.length,total:catalog.sources.length}));
});
if(resume){
 report.articles=[];
 for(const result of report.sources){
  if(!['rss_feed','google_news'].includes(result.kind)||result.error||!result.bodyFile)continue;
  const body=await fs.readFile(path.join(out,result.bodyFile),'utf8');
  const items=(result.kind==='google_news'?parser.parseGoogleNewsRssFeed:parser.parseRssFeed)(body,{sourceId:'probe',sourceTitle:result.input,sourceUrl:result.url,receivedAt:new Date(result.checkedAt)});
  result.sampleItems=items.slice(0,2).map(x=>({text:x.text.slice(0,180),url:x.links[0],postedAt:x.postedAt}));
 }
}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
const seen=new Set(),samples=[];
for(const source of report.sources){const item=source.sampleItems?.find(x=>x.url&&/^https?:/.test(x.url));if(!item||seen.has(item.url))continue;seen.add(item.url);samples.push({url:item.url,input:source.input,kind:source.kind});}
await mapLimit(samples,async sample=>{const {result}=await get(sample.url);report.articles.push({...result,input:sample.input,kind:sample.kind,check:'One discovery link per successful RSS/search input; HTTP availability only, not extraction or Google publisher resolution.'});});
report.completedAt=new Date().toISOString();
report.summary={};
for(const source of report.sources){const group=report.summary[source.kind]??={total:0,outcomes:{}};group.total++;const status=source.error??source.warning??(['rss_feed','google_news'].includes(source.kind)?'PARSED_NONEMPTY':'PUBLIC_HTTP_OK');group.outcomes[status]=(group.outcomes[status]??0)+1;}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({out,summary:report.summary,articleChecks:report.articles.length,articleErrors:report.articles.filter(x=>x.error).map(x=>({url:x.url,error:x.error}))}));

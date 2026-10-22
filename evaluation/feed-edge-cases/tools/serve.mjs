// Serves the scenarios as live sources whose content follows the clock, for a QA run.
// Usage: node evaluation/feed-edge-cases/tools/serve.mjs [--start next|ISO] [--port 8787] [--base https://public-tunnel-url]
//   GET /                                       index with every source URL
//   GET /scenarios/:id/sources/:key             RSS (rss, google-news) or JSON (x, telegram, linkedin)
//       ?at=W2+5m                               show the source as it is at that scenario time instead of now
//       ?since=..&until=..                      JSON sources only: publication-time bounds (ISO or W-expressions), inclusive
//   GET /scenarios/:id/articles/:itemId         article page (410 once deleted, paywall teaser when paywalled)
import {createServer} from 'node:http';
import {parseArgs} from 'node:util';
import {listing,loadScenarios,materialize,parseTime,renderArticle,renderRss,renderSocial,rootId} from './lib.mjs';
import {alignedStart} from './build.mjs';
import {validate} from './validate.mjs';

const {values}=parseArgs({options:{start:{type:'string',default:'next'},port:{type:'string',default:'8787'},base:{type:'string'}}});
const {errors}=validate();
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
const startMs=alignedStart(values.start),base=values.base??`http://localhost:${values.port}`;
const scenarios=new Map(loadScenarios().map(s=>[s.id,{scenario:s,items:materialize(s)}]));
const fetchCounts=new Map();

function scenarioTime(value,scenario){
  if(value===null||value===undefined)return undefined;
  // An unencoded "+" in a query string arrives as a space.
  value=value.replace(' ','+');
  return value.startsWith('W')?parseTime(value,scenario.schedule.durationMinutes):Date.parse(value)-startMs;
}
function send(res,status,type,body){res.writeHead(status,{'content-type':`${type}; charset=utf-8`,'cache-control':'no-store'});res.end(body)}

createServer((req,res)=>{
  try {handle(req,res)} catch(error){send(res,400,'text/plain',error.message)}
}).listen(Number(values.port),()=>console.log(`Serving ${scenarios.size} scenarios on ${base}; window 1 opens ${new Date(startMs).toISOString()}`));

function handle(req,res){
  const url=new URL(req.url,base),parts=url.pathname.split('/').filter(Boolean);
  if(!parts.length)return send(res,200,'application/json',JSON.stringify({start:new Date(startMs).toISOString(),
    scenarios:[...scenarios.values()].map(({scenario})=>({id:scenario.id,feed:scenario.feed,windows:scenario.windows,
      sources:scenario.sources.map(s=>({key:s.key,type:s.type,url:`${base}/scenarios/${scenario.id}/sources/${s.key}`}))}))},null,2));
  const entry=parts[0]==='scenarios'?scenarios.get(parts[1]):undefined;
  if(!entry||parts.length!==4)return send(res,404,'text/plain','not found');
  const {scenario,items}=entry,now=scenarioTime(url.searchParams.get('at'),scenario)??Date.now()-startMs;
  if(parts[2]==='sources'){
    const source=scenario.sources.find(s=>s.key===parts[3]);
    if(!source)return send(res,404,'text/plain','unknown source');
    const counter=`${scenario.id}/${source.key}`,fetchSeq=(fetchCounts.get(counter)??0)+1;fetchCounts.set(counter,fetchSeq);
    const bounds={since:scenarioTime(url.searchParams.get('since'),scenario),until:scenarioTime(url.searchParams.get('until'),scenario),fetchSeq};
    const visible=listing(scenario,items,source.key,now,bounds);
    return source.type==='rss'||source.type==='google-news'
      ?send(res,200,'application/rss+xml',renderRss(scenario,source,visible,{startMs,base}))
      :send(res,200,'application/json',JSON.stringify(renderSocial(scenario,source,visible,{startMs,base}),null,2));
  }
  if(parts[2]==='articles'){
    const root=items.find(i=>i.id===parts[3]);
    if(!root||root.appearsAtMs>now)return send(res,404,'text/plain','not found');
    // The newest edit that has appeared is what the page shows now.
    const current=items.filter(i=>(i.id===root.id||i.editOf&&rootId(items,i.editOf)===root.id)&&i.appearsAtMs<=now).at(-1);
    if(current.op==='delete')return send(res,410,'text/plain','gone');
    return send(res,200,'text/html',renderArticle(scenario,current,{startMs}));
  }
  send(res,404,'text/plain','not found');
}

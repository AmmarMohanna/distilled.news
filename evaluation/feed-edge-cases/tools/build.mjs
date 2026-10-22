// Writes each scenario with absolute times and full text, for a replay that starts at --start.
// Usage: node evaluation/feed-edge-cases/tools/build.mjs --start 2026-10-23T09:00:00Z [--base http://localhost:8787] [--out dir]
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {ROOT,loadWorld,materialize,resolveUrl,windowOf} from './lib.mjs';
import {validate} from './validate.mjs';

export function alignedStart(value){
  const start=value==='next'?Math.ceil(Date.now()/1_800_000)*1_800_000:Date.parse(value);
  if(!Number.isFinite(start))throw new Error(`--start must be an ISO time or "next", got ${value}`);
  // Live windows advance in 30-minute steps from a local anchor; every supported
  // timezone used here has a whole- or half-hour offset, so :00/:30 UTC is a boundary.
  if(start%1_800_000)throw new Error('--start must be on a :00 or :30 boundary');
  return start;
}

export function buildScenario(scenario,{startMs,base}){
  const world=loadWorld(),duration=scenario.schedule.durationMinutes,windowMs=duration*60_000;
  const at=ms=>ms===null||ms===undefined?null:new Date(startMs+ms).toISOString();
  return {
    id:scenario.id,title:scenario.title,cases:scenario.cases,notes:scenario.notes,
    feed:{...world.feeds[scenario.feed],schedule:scenario.schedule},
    windows:Array.from({length:scenario.windows},(_,i)=>({window:i+1,start:at(i*windowMs),end:at((i+1)*windowMs)})),
    run:scenario.run,
    sources:scenario.sources.map(s=>({...s,url:`${base}/scenarios/${scenario.id}/sources/${s.key}`,publisherName:world.publishers[s.publisher].name})),
    items:materialize(scenario).map(item=>({
      id:item.id,source:item.source,op:item.op,guid:item.guid,url:resolveUrl(item.url,base),lang:item.lang,
      appearsAt:at(item.appearsAtMs),appearsInWindow:windowOf(item.appearsAtMs,duration),
      publishedAt:item.rawPubDate??at(item.publishedAtMs),
      ...(item.editOf?{editOf:item.editOf}:{}),...(item.variantOf?{variantOf:item.variantOf}:{}),...(item.change?{change:item.change}:{}),
      ...(item.excerptOnly?{excerptOnly:true}:{}),...(item.paywalled?{paywalled:true}:{}),
      ...(item.forwardedFrom?{forwardedFrom:item.forwardedFrom}:{}),...(item.inReplyTo?{inReplyTo:item.inReplyTo}:{}),...(item.media?{media:item.media}:{}),
      title:item.title,body:item.body})),
    checks:scenario.checks,
  };
}

if(import.meta.url===`file://${process.argv[1]}`){
  const {values}=parseArgs({options:{start:{type:'string',default:'next'},base:{type:'string',default:'http://localhost:8787'},out:{type:'string',default:join(ROOT,'build')}}});
  const {errors,scenarios}=validate();
  if(errors.length){console.error(errors.join('\n'));process.exit(1)}
  const startMs=alignedStart(values.start);
  mkdirSync(values.out,{recursive:true});
  for(const scenario of scenarios)writeFileSync(join(values.out,`${scenario.id}.json`),`${JSON.stringify(buildScenario(scenario,{startMs,base:values.base}),null,2)}\n`);
  console.log(`Wrote ${scenarios.length} scenarios to ${values.out}, window 1 opens ${new Date(startMs).toISOString()}`);
}

// Shared loading, time and rendering helpers for the feed edge-case dataset.
// No dependencies: runs on plain Node 22.
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
const UNIT_MS={s:1000,m:60_000,h:3_600_000,d:86_400_000};
export const SOURCE_TYPES=['rss','google-news','x','telegram','linkedin'];

export function readJson(path){return JSON.parse(readFileSync(path,'utf8'))}
export function loadWorld(){return readJson(join(ROOT,'world.json'))}
export function loadCases(){return readJson(join(ROOT,'cases.json')).cases}
export function loadScenarios(){
  const dir=join(ROOT,'scenarios');
  return readdirSync(dir).filter(f=>f.endsWith('.json')).sort().map(f=>({file:f,...readJson(join(dir,f))}));
}

/** "W2+8m" is 8 minutes after window 2 opens; "W1-3d" is 3 days before window 1 opens.
 * Window n opens at start + (n-1) * duration. Returns ms offset from the start. */
export function parseTime(expr,durationMinutes){
  const match=/^W(\d+)(?:([+-])(\d+)([smhd]))?$/.exec(expr??'');
  if(!match)throw new Error(`bad time expression ${JSON.stringify(expr)}`);
  const [,window,sign,amount,unit]=match;
  if(Number(window)<1)throw new Error(`window numbers start at 1: ${expr}`);
  const offset=sign?(sign==='-'?-1:1)*Number(amount)*UNIT_MS[unit]:0;
  return (Number(window)-1)*durationMinutes*60_000+offset;
}
export function windowOf(offsetMs,durationMinutes){return Math.floor(offsetMs/(durationMinutes*60_000))+1}

function seededRandom(seed){
  let state=parseInt(createHash('sha256').update(seed).digest('hex').slice(0,8),16);
  return ()=>(state=(state*1664525+1013904223)>>>0)/2**32;
}
function fill(template,values){return template.replace(/\{(\w+)\}/g,(_,key)=>String(values[key]??`{${key}}`))}

/** Expands generate blocks and variants into plain items with every field set. */
export function materialize(scenario){
  const duration=scenario.schedule.durationMinutes,raw=[];
  for(const entry of scenario.items){
    if(!entry.generate){raw.push(entry);continue}
    const g=entry.generate,random=seededRandom(`${scenario.id}:${g.idPrefix}`);
    const from=parseTime(g.publishedFrom,duration),to=parseTime(g.publishedTo,duration);
    for(let n=1;n<=g.count;n++){
      const topic=g.topics[(n-1)%g.topics.length],values={n,...topic};
      raw.push({id:`${g.idPrefix}${n}`,source:g.source,appearsAt:g.appearsAt,
        publishedAtMs:Math.round(from+(to-from)*random()),title:fill(g.titleTemplate,values),body:fill(g.bodyTemplate,values),generated:true});
    }
  }
  const byId=new Map();
  for(const item of raw){
    let {title,body}=item;
    if(item.variantOf){
      const base=byId.get(item.variantOf);
      if(!base)throw new Error(`${scenario.id}/${item.id}: variantOf ${item.variantOf} must come earlier`);
      title??=base.title;body??=base.body;
      for(const edit of item.edits??[]){
        const field=edit.field??'body',text=field==='title'?title:body,count=text.split(edit.find).length-1;
        if(count!==1)throw new Error(`${scenario.id}/${item.id}: edit text must occur once in ${field}, found ${count}: ${JSON.stringify(edit.find)}`);
        if(field==='title')title=text.replace(edit.find,edit.replace);else body=text.replace(edit.find,edit.replace);
      }
    }
    const appearsAtMs=parseTime(item.appearsAt,duration);
    // An in-place edit keeps the original date unless it says otherwise, as most feeds do.
    const publishedAtMs=item.publishedAtMs??(item.publishedAt===null||item.rawPubDate?null
      :item.publishedAt!==undefined?parseTime(item.publishedAt,duration)
      :item.editOf?byId.get(item.editOf)?.publishedAtMs??null:parseTime(item.appearsAt,duration));
    const done={...item,title,body,appearsAtMs,publishedAtMs,
      guid:item.guid===null?null:(item.guid??(item.editOf?byId.get(item.editOf)?.guid:undefined)??item.id),
      url:item.url??(item.editOf?byId.get(item.editOf)?.url:undefined)??`{base}/scenarios/${scenario.id}/articles/${item.editOf?rootOf(byId,item.editOf):item.id}`,
      lang:item.lang??scenario.lang??'en',op:item.op??'upsert'};
    byId.set(item.id,done);
  }
  return [...byId.values()];
}
function rootOf(byId,id){let item=byId.get(id);while(item?.editOf)item=byId.get(item.editOf);return item?.id??id}
export function rootId(items,id){return rootOf(new Map(items.map(i=>[i.id,i])),id)}

/** What a source shows at `nowMs` (offset from start). An edit or delete replaces
 * the item it edits; RSS-like sources keep the newest `maxItems`. Social sources
 * can be filtered by publication time, inclusive at both ends like provider date search. */
export function listing(scenario,items,sourceKey,nowMs,{since,until,fetchSeq=0}={}){
  const source=scenario.sources.find(s=>s.key===sourceKey);
  const current=new Map();
  for(const item of items.filter(i=>i.source===sourceKey&&i.appearsAtMs<=nowMs).sort((a,b)=>a.appearsAtMs-b.appearsAtMs)){
    current.set(item.editOf?rootId(items,item.editOf):item.id,item);
  }
  let visible=[...current.values()].filter(i=>i.op!=='delete');
  if(since!==undefined)visible=visible.filter(i=>i.publishedAtMs!==null&&i.publishedAtMs>=since);
  if(until!==undefined)visible=visible.filter(i=>i.publishedAtMs!==null&&i.publishedAtMs<=until);
  visible.sort((a,b)=>(b.publishedAtMs??b.appearsAtMs)-(a.publishedAtMs??a.appearsAtMs));
  visible=visible.slice(0,source.maxItems??(source.type==='rss'||source.type==='google-news'?25:100));
  // A broken feed that mints a new guid on every fetch (case D1).
  if(source.guidPolicy==='per-fetch')visible=visible.map(i=>({...i,guid:`${i.guid??i.id}-${createHash('sha256').update(`${i.id}:${fetchSeq}`).digest('hex').slice(0,10)}`}));
  return visible;
}

const xml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const iso=(startMs,offset)=>new Date(startMs+offset).toISOString();
export function resolveUrl(url,base){return url.replace('{base}',base)}
function excerpt(body,words=45){const parts=body.split(/\s+/);return parts.length<=words?body:`${parts.slice(0,words).join(' ')}…`}

export function renderRss(scenario,source,visible,{startMs,base}){
  const world=loadWorld(),publisher=world.publishers[source.publisher];
  const entries=visible.map(item=>{
    const link=resolveUrl(item.url,base);
    const title=source.type==='google-news'?`${item.title} - ${world.publishers[item.publisher??source.publisher]?.name??publisher.name}`:item.title;
    const pubDate=item.rawPubDate??(item.publishedAtMs===null?null:new Date(startMs+item.publishedAtMs).toUTCString());
    const description=item.excerptOnly||source.type==='google-news'?excerpt(item.body):item.body;
    return ['<item>',`<title>${xml(title)}</title>`,`<link>${xml(link)}</link>`,
      item.guid===null?'':`<guid isPermaLink="false">${xml(item.guid)}</guid>`,
      pubDate===null?'':`<pubDate>${xml(pubDate)}</pubDate>`,
      `<description>${xml(description)}</description>`,'</item>'].filter(Boolean).join('');
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${xml(source.name??publisher.name)}</title><link>${xml(resolveUrl(`{base}/scenarios/${scenario.id}/sources/${source.key}`,base))}</link><description>Fictional test source for Distilled.news (${xml(scenario.id)})</description>\n${entries.join('\n')}\n</channel></rss>\n`;
}
export function renderSocial(scenario,source,visible,{startMs,base}){
  return {source:source.key,type:source.type,handle:source.handle,items:visible.map(item=>({
    id:item.guid??item.id,url:resolveUrl(item.url,base),text:item.title?`${item.title}\n\n${item.body}`:item.body,
    createdAt:item.publishedAtMs===null?null:iso(startMs,item.publishedAtMs),lang:item.lang,
    ...(item.forwardedFrom?{forwardedFrom:item.forwardedFrom}:{}),...(item.media?{media:item.media}:{}),
    ...(item.inReplyTo?{inReplyTo:item.inReplyTo}:{}),...(item.editOf?{edited:true}:{})}))};
}
export function renderArticle(scenario,item,{startMs}){
  const world=loadWorld(),source=scenario.sources.find(s=>s.key===item.source),publisher=world.publishers[item.publisher??source.publisher];
  const published=item.publishedAtMs===null?'':`<time datetime="${iso(startMs,item.publishedAtMs)}">${new Date(startMs+item.publishedAtMs).toUTCString()}</time>`;
  const paragraphs=(item.paywalled?excerpt(item.body,35):item.body).split(/\n\n+/).map(p=>`<p>${xml(p)}</p>`).join('\n');
  return `<!doctype html><html lang="${item.lang}"><head><meta charset="utf-8"><title>${xml(item.title)} | ${xml(publisher.name)}</title></head><body><article><h1>${xml(item.title)}</h1><p class="byline">${xml(publisher.name)} ${published}</p>\n${paragraphs}\n${item.paywalled?'<div class="paywall">Subscribe to read the full article.</div>':''}</article></body></html>\n`;
}

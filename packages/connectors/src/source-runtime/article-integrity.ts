import {parse} from 'parse5';
import {isArticleSchemaType,matchesOpaqueArticlePage} from './article-schema';

interface Node {tagName?:string;attrs?:{name:string;value:string}[];childNodes?:Node[];value?:string}
export interface ArticleDateCandidate {value:string;source:string}
export interface ArticleDateMetadata {
  publishedAt?:string;
  updatedAt?:string;
  publicationConflict:boolean;
  candidates:ArticleDateCandidate[];
}
const attr=(n:Node,key:string)=>n.attrs?.find(a=>a.name===key)?.value??'';
const timestamp=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():undefined;
/** Compatible date-only metadata may accompany a precise timestamp. Different
 * original dates stay unresolved; never choose a fresh date by document order. */
function uniqueDate(values:string[]):string|undefined {
  const unique=[...new Set(values)],precise=unique.filter(v=>!v.endsWith('T00:00:00.000Z'));
  return unique.length===1?unique[0]:unique.length&&unique.every(v=>v.slice(0,10)===unique[0].slice(0,10))&&precise.length===1?precise[0]:undefined;
}
/** Read only explicit publisher publication/update fields. Do not infer an
 * original date from article prose, a URL, HTTP headers or collection time. */
export function readArticleDateMetadata(html:string,url:string):ArticleDateMetadata {
  const candidates:ArticleDateCandidate[]=[],modified:string[]=[];
  const add=(value:unknown,source:string,update=false)=>{const date=timestamp(value);if(date){if(update)modified.push(date);else candidates.push({value:date,source});}};
  const samePage=(value:unknown)=>{
    const ref=typeof value==='string'?value:value&&typeof value==='object'?(value as Record<string,unknown>)['@id']:undefined;
    if(typeof ref!=='string')return false;
    try{const a=new URL(ref,url),b=new URL(url);a.hash='';b.hash='';return a.href===b.href;}catch{return false;}
  };
  const articles:Record<string,unknown>[]=[];
  const json=(value:unknown)=>{
    if(Array.isArray(value)){value.forEach(json);return;}
    if(!value||typeof value!=='object')return;
    const r=value as Record<string,unknown>,types=Array.isArray(r['@type'])?r['@type']:[r['@type']];
    if(types.some(isArticleSchemaType))articles.push(r);
    if(r['@graph'])json(r['@graph']);
    if(r.mainEntity)json(r.mainEntity);
  };
  const stack=[parse(html) as unknown as Node];let canonical:string|undefined,title:string|undefined;
  while(stack.length){
    const n=stack.pop()!;
    if(n.tagName==='link'&&attr(n,'rel').split(/\s+/).includes('canonical'))canonical=attr(n,'href');
    if(n.tagName==='h1'){
      const parts:string[]=[],pending=[n];while(pending.length){const p=pending.pop()!;if(p.value)parts.push(p.value);pending.push(...[...(p.childNodes??[])].reverse());}title=parts.join('');
    }
    if(n.tagName==='meta'||n.tagName==='time'){
      const name=(attr(n,'property')||attr(n,'name')||attr(n,'itemprop')).toLowerCase(),value=attr(n,n.tagName==='time'?'datetime':'content');
      if(['article:published_time','datepublished','pubdate','publishdate','parsely-pub-date'].includes(name))add(value,`html:${name}`);
      if(['article:modified_time','datemodified','lastmod'].includes(name))add(value,`html:${name}`,true);
    }
    if(n.tagName==='script'&&attr(n,'type').toLowerCase()==='application/ld+json'){
      try{json(JSON.parse((n.childNodes??[]).map(c=>c.value??'').join('')));}catch{/* Malformed metadata is not a publication date. */}
    }
    if(!['script','style','template'].includes(n.tagName??''))stack.push(...(n.childNodes??[]));
  }
  const scoped=articles.filter(r=>[r.url,r.mainEntityOfPage,r['@id']].some(samePage)||matchesOpaqueArticlePage(r,url,canonical,title));
  // A single unscoped Article is usable; related/foreign articles never donate dates.
  const relevant=scoped.length?scoped:articles.length===1&&!articles[0].url&&!articles[0].mainEntityOfPage&&!articles[0]['@id']?articles:[];
  for(const r of relevant){add(r.datePublished,'jsonld:datePublished');add(r.dateModified,'jsonld:dateModified',true);}
  const publishedAt=uniqueDate(candidates.map(c=>c.value));
  return {publishedAt,updatedAt:uniqueDate(modified),publicationConflict:candidates.length>0&&!publishedAt,candidates};
}

/** A negative integrity check, independent of language or editorial meaning.
 * Passing does not prove that an extractor recovered the complete article. */
export function unreadableArticleReason(body:string):string|undefined {
  const text=body.replace(/https?:\/\/\S+/g,''),compact=text.replace(/\s/g,'');
  if(!compact)return 'EMPTY_ARTICLE_TEXT';
  const damaged=(text.match(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g)??[]).length;
  if(damaged>=3&&damaged/compact.length>0.005)return 'CORRUPT_ARTICLE_ENCODING';
  const escapes=text.match(/(?:&#(?:x[0-9a-f]+|\d+);|\\u[0-9a-f]{4}|%[0-9a-f]{2})/gi)??[];
  if(escapes.length>=8&&escapes.join('').length/compact.length>0.1)return 'ENCODED_ARTICLE_TEXT';
  const blobs=text.match(/[A-Za-z0-9+/_=-]{80,}/g)??[];
  if(blobs.join('').length>=120&&blobs.join('').length/compact.length>0.15)return 'ENCODED_ARTICLE_TEXT';
  const mojibake=(text.match(/Ã.|Â.|â€|ðŸ/g)??[]).length;
  if(mojibake>=8&&mojibake/compact.length>0.02)return 'CORRUPT_ARTICLE_ENCODING';
  const letters=(compact.match(/[\p{L}\p{M}\p{N}]/gu)??[]).length;
  if(compact.length>=200&&letters/compact.length<0.4)return 'NON_TEXT_ARTICLE_BODY';
  return undefined;
}

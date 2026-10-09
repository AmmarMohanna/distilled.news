import type { ProviderItem, SourceFamily } from './provider-types';

export const record=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
export const string=(v:unknown):string|undefined=>typeof v==='string'&&v.trim()?v.trim():undefined;
export const timestamp=(v:unknown):string|undefined=>{
  if(typeof v!=='string'&&typeof v!=='number')return undefined;
  // A calendar date is not an exact publication instant; let intake quarantine it
  // when precise query-window validation is required rather than invent midnight.
  if(typeof v==='string'&&/^\d{4}-\d{2}(?:-\d{2})?$/.test(v.trim()))return undefined;
  const n=typeof v==='number'?v<1e12?v*1000:v:Date.parse(v);
  return Number.isFinite(n)?new Date(n).toISOString():undefined;
};
export function articleUrl(v:unknown):string|undefined{
  try{const u=new URL(string(v)??'');if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password){
    u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_/i.test(key)||['fbclid','gclid','mc_cid','mc_eid','igshid'].includes(key.toLowerCase()))u.searchParams.delete(key);
    return u.href;
  }}catch{}
}
export function normalizeProviderRecords(rows:unknown[],family:SourceFamily):ProviderItem[] {
  const map=new Map<string,ProviderItem>();
  rows.forEach((raw,index)=>{
    const r=record(raw),author=record(r.author??r.user);
    let upstreamId=string(r.id)??string(r.tweetId)??string(r.postId)??string(r.urn);
    let url=articleUrl(r.publisherUrl??r.url??r.tweetUrl??r.postUrl??r.link);
    const body=string(r.text??r.fullText??r.full_text??r.content??r.commentary??r.description??r.snippet);
    const isX=family==='x_profile'||family==='x_search',isLinkedIn=family.startsWith('linkedin');
    if(isX){upstreamId=upstreamId&&/^\d+$/.test(upstreamId)?upstreamId:url?.match(/\/status\/(\d+)/)?.[1];url=upstreamId?`https://x.com/i/status/${upstreamId}`:undefined;}
    if(isLinkedIn){upstreamId=upstreamId??url?.match(/activity[-:](\d+)/)?.[1];}
    const key=isX&&upstreamId?`x:${upstreamId}`:isLinkedIn&&upstreamId?`linkedin:${upstreamId}`:url?`url:${url}`:upstreamId?`id:${upstreamId}`:`invalid-row:${index}`;
    const xAccountId=string(author.id_str??author.id??author.userId)??
      (Number.isSafeInteger(author.id)&&author.id>0?String(author.id):undefined);
    const publisherId=isX?(xAccountId&&/^\d+$/.test(xAccountId)?`x:${xAccountId}`:string(author.userName??author.username??r.username)):
      isLinkedIn?string(author.urn??author.id??author.publicIdentifier??author.universalName??r.authorName??r.companyName):
        string(r.sourceDomain??r.publisherDomain)??(url?new URL(url).hostname:undefined);
    const posted=record(r.postedAt);
    const item:ProviderItem={sourceItemKey:key,upstreamId,url,publisherId,title:string(r.title),body,
      publishedAt:[r.publishedAt,r.createdAt,r.created_at,r.date,posted.date,posted.timestamp,r.postedAt].map(timestamp).find(Boolean),language:string(r.lang??r.language),
      representation:isX||isLinkedIn?'SOCIAL_POST':family==='google_news'?'LISTING_RESULT':'API_RECORD',
      // Provider text may be truncated; unknown is preferable to unsupported completeness claims.
      contentCompleteness:'UNKNOWN',authoritativeCurrentState:false,identityValid:!!(upstreamId||url)};
    const previous=map.get(key);
    if(previous){if(JSON.stringify(previous)!==JSON.stringify(item)){previous.body=undefined;previous.title=undefined;}return;}
    map.set(key,item);
  });
  return [...map.values()];
}

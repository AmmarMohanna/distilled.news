import {sameArticleUrl as samePublisherArticleUrl} from '@distilled/connectors';
/** Comparison only: never rewrite stored URLs or paid-operation identities. */
export function sameArticleUrl(left:unknown,right:unknown):boolean {
 if(typeof left!=='string'||typeof right!=='string')return false;
 try{
  const normalize=(value:string)=>{
   const u=new URL(value);
   if(u.protocol!=='https:'||u.username||u.password)throw Error('INVALID_ARTICLE_URL');
   for(const key of [...u.searchParams.keys()])if(/^utm_/i.test(key)||/^(?:fbclid|gclid|mc_cid|mc_eid|igshid|traffic_source)$/i.test(key))u.searchParams.delete(key);
   // NEJM adds this attribution URL during anonymous browser navigation.
   if(u.hostname==='www.nejm.org'&&u.searchParams.get('referrer')==='https://www.google.com/')u.searchParams.delete('referrer');
   u.pathname=u.pathname.replace(/%[0-9a-f]{2}/gi,part=>part.toUpperCase()).replace(/\/$/,'')||'/';u.hash='';return u.href;
  };
  return samePublisherArticleUrl(normalize(left),normalize(right));
 }catch{return false}
}
/** A publisher's public abstract is the same PII article, but only partial evidence. */
export function scholarlyAbstractAlias(requested:unknown,resolved:unknown):boolean {
 if(typeof requested!=='string'||typeof resolved!=='string')return false;
 try{
  const u=new URL(requested);
  if(!/^\/journals\/[^/]+\/article\/PII[A-Za-z0-9().-]+\/fulltext\/?$/.test(u.pathname))return false;
  u.pathname=u.pathname.replace(/\/fulltext\/?$/,'/abstract');return sameArticleUrl(u.href,resolved);
 }catch{return false}
}

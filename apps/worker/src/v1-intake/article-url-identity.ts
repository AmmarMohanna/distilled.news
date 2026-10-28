/** Comparison only: never rewrite stored URLs or paid-operation identities. */
export function sameArticleUrl(left:unknown,right:unknown):boolean {
 if(typeof left!=='string'||typeof right!=='string')return false;
 try{
  const normalize=(value:string)=>{
   const u=new URL(value);
   if(u.protocol!=='https:'||u.username||u.password)throw Error('INVALID_ARTICLE_URL');
   for(const key of [...u.searchParams.keys()])if(/^utm_/i.test(key)||/^(?:fbclid|gclid|traffic_source)$/i.test(key))u.searchParams.delete(key);
   u.pathname=u.pathname.replace(/\/$/,'')||'/';u.hash='';return u.href;
  };
  return normalize(left)===normalize(right);
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

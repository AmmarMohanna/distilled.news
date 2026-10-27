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

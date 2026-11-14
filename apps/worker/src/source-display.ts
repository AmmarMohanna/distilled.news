/** Display names come from approved source identities, never guessed from article prose. */
export function genericSourceName(value:string|undefined|null):boolean{return !value||['source','x.com','www.x.com','twitter.com','www.twitter.com','t.me','telegram.me'].includes(value.trim().toLowerCase())||/^x:\d+$/.test(value)}
export function sourceIdentityName(name?:string|null,canonicalUrl?:string|null):string|undefined{
 if(!genericSourceName(name))return name!.trim();
 try{const u=new URL(canonicalUrl??'');if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return undefined;const host=u.hostname.toLowerCase().replace(/^www\./,'');
  if(['x.com','twitter.com'].includes(host)){
   const username=u.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1];if(username&&!['i','search','home','explore','intent','share','settings'].includes(username.toLowerCase()))return '@'+username;
   if(u.pathname==='/search'){const q=u.searchParams.get('q')??'';const from=q.match(/^from:([A-Za-z0-9_]{1,15})(?:\s+lang:[a-z]{2,3})?$/i)?.[1];if(from)return '@'+from;}
  }
  if(['t.me','telegram.me'].includes(host)){const username=u.pathname.match(/^\/([A-Za-z0-9_]{5,32})\/?$/)?.[1];if(username)return '@'+username;}
  if(!['x.com','twitter.com','t.me','telegram.me'].includes(host))return name?.trim()||host;
 }catch{/* Unknown identity remains unknown rather than receiving an invented outlet. */}
 return undefined;
}

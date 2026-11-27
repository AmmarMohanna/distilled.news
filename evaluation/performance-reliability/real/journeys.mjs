/** Pure assertions shared by real k6 journeys and offline regression tests. */
export function readViolation(name,status,value,user,feed){
 if(name==='foreign-private')return status===200?'PRIVATE_FEED_EXPOSED':null;
 if(status!==200)return null; // HTTP failures are measured independently.
 if((name==='session'||name==='account')&&value?.account?.id!==user.id)return 'ACCOUNT_RESPONSE_MISMATCH';
 if(name==='owned-feeds'&&(!Array.isArray(value?.briefings)||value.briefings.some(f=>f.ownerAccountId!==user.id)))return 'OWNED_FEED_SCOPE_MISMATCH';
 if(name==='feed'&&(value?.briefing?.id!==feed.id||value?.briefing?.ownerAccountId!==user.id))return 'FEED_RESPONSE_MISMATCH';
 if(name==='explore'&&(!Array.isArray(value?.feeds)||value.feeds.some(f=>f.publicFeedEnabled!==true||f.ownerAccountId===user.id)))return 'EXPLORE_VISIBILITY_MISMATCH';
 return null;
}

/** Reader-facing pages are the single-page app shell served by the Worker. */
export const PAGE_NAMES=['page-home','page-explore','page-feed'];
export function pageViolation(name,status,contentType,body){
 if(!PAGE_NAMES.includes(name)||status!==200)return null; // HTTP failures are measured independently.
 if(!/^text\/html\b/i.test(contentType??'')||typeof body!=='string'||!/<script\b[^>]*\bsrc=/i.test(body))return 'PAGE_SHELL_MISMATCH';
 return null;
}
/** Same-origin hashed bundle paths referenced by the app shell, scripts first. */
export function assetPaths(html){
 if(typeof html!=='string')return [];
 const found=[...html.matchAll(/<script\b[^>]*\bsrc="(\/assets\/[^"?#]+)"/gi),...html.matchAll(/<link\b[^>]*\bhref="(\/assets\/[^"?#]+\.css)"/gi)].map(m=>m[1]);
 return [...new Set(found)].filter(p=>/^\/assets\/[A-Za-z0-9._-]+$/.test(p)).slice(0,4);
}

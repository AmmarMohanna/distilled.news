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

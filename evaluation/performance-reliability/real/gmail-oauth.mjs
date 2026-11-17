import {createHash,timingSafeEqual} from 'node:crypto';
export const GMAIL_READONLY='https://www.googleapis.com/auth/gmail.readonly';
export function gmailAlias(base,runId,slot){
 const match=String(base).trim().toLowerCase().match(/^([a-z0-9.]+)@gmail\.com$/);
 if(!match||!/^[a-z0-9]{8,24}$/.test(runId)||!Number.isSafeInteger(slot)||slot<0||slot>19)throw Error('INVALID_QA_GMAIL_ALIAS');
 return `${match[1]}+${runId}-u${slot}@gmail.com`;
}
export function desktopClient(value){
 const c=value?.installed;
 if(!c?.client_id||c.auth_uri!=='https://accounts.google.com/o/oauth2/auth'||c.token_uri!=='https://oauth2.googleapis.com/token')throw Error('GOOGLE_DESKTOP_CLIENT_REQUIRED');
 return c;
}
export function consentUrl(client,redirect,state,verifier){
 const c=desktopClient(client),r=new URL(redirect);
 if(r.protocol!=='http:'||r.hostname!=='127.0.0.1'||!r.port||r.pathname!=='/oauth2/callback'||r.search||r.hash||r.username||r.password||!/^[a-zA-Z0-9_-]{32,128}$/.test(state)||!/^[a-zA-Z0-9_-]{43,128}$/.test(verifier))throw Error('SAFE_LOOPBACK_PKCE_REQUIRED');
 const u=new URL(c.auth_uri);u.search=new URLSearchParams({client_id:c.client_id,redirect_uri:redirect,response_type:'code',scope:GMAIL_READONLY,access_type:'offline',prompt:'consent',include_granted_scopes:'false',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();return u.toString();
}
export function callbackCode(value,state){
 const u=new URL(value,'http://127.0.0.1'),received=u.searchParams.get('state')??'';
 const a=Buffer.from(received),b=Buffer.from(state);
 if(u.pathname!=='/oauth2/callback'||u.searchParams.getAll('state').length!==1||a.length!==b.length||!timingSafeEqual(a,b))throw Error('OAUTH_STATE_MISMATCH');
 if(u.searchParams.has('error')||u.searchParams.getAll('code').length!==1||!u.searchParams.get('code'))throw Error('OAUTH_NOT_AUTHORIZED');
 return u.searchParams.get('code');
}

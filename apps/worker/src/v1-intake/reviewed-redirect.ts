import type {DownstreamJob} from './types';
export interface ReviewedRedirect {from:string;to:string;headline:string}
const headlineKey=(s:string)=>s.normalize('NFKC').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\s+/g,' ').trim().toLowerCase();
/** A per-job operator review, never automatic fuzzy identity matching. */
export function reviewedRedirectFor(job:DownstreamJob,from:string):ReviewedRedirect|undefined {
 const a=job.recoveryAuthorizations?.at(-1),r=a?.reviewedRedirect;
 if(!a?.unpaidOnly||!r||r.from!==from)return;
 try{const f=new URL(r.from),t=new URL(r.to);if(f.protocol!=='https:'||t.protocol!=='https:'||f.origin!==t.origin||f.username||f.password||t.username||t.password||f.href===t.href||r.headline.trim().length<20)return;}catch{return;}
 return r;
}
export function matchesReviewedRedirect(r:ReviewedRedirect|undefined,to:unknown,headline:unknown):boolean {
 return !!r&&to===r.to&&typeof headline==='string'&&headlineKey(headline)===headlineKey(r.headline);
}

import type {EvidenceRole} from './types';
export const INTELLIGENCE_POLICY='deterministic-news-v1';
const stop=new Set('a an the and or of to in on for at as with by from is are was were has have had after before following new latest today tuesday monday wednesday thursday friday saturday sunday'.split(' '));
const aliases:Record<string,string>={legislature:'parliament',legislation:'law',bill:'law',laws:'law',passed:'approve',passes:'approve',approved:'approve',approves:'approve',approving:'approve',proposed:'propose',proposes:'propose',proposal:'propose',proposing:'propose',rejected:'reject',rejects:'reject',rejecting:'reject',signed:'sign',signing:'sign',announced:'announce',announces:'announce',negotiations:'debate',negotiation:'debate'};
export function tokens(text:string):string[] {return (text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]).filter(t=>!stop.has(t)).map(t=>aliases[t]??t)}
export interface Features {keywords:string[];entities:string[];development:string}
export function features(text:string):Features {
 const words=tokens(text),development=words.find(t=>['approve','propose','reject','sign','announce'].includes(t))??'report';
 const entities=[...new Set((text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*/g)??[]).filter(t=>!stop.has(t.toLowerCase())&&!['Opinion','Analysis','Sponsored','Breaking','Development'].includes(t)).map(t=>tokens(t).join(' ')))].filter(Boolean);
 return {keywords:[...new Set(words)],entities,development};
}
export function overlap(a:string[],b:string[]):number {const aa=new Set(a),bb=new Set(b),intersection=[...aa].filter(x=>bb.has(x)).length;return intersection/Math.max(1,new Set([...aa,...bb]).size)}
export function eventSimilarity(a:Features,b:Features):number {
 if(a.development!==b.development) return 0;
 return overlap(a.keywords,b.keywords);
}
export function duplicateSimilarity(a:string,b:string):number {
 const normalize=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
 if(normalize(a)===normalize(b)) return 1;
 const shingle=(s:string)=>{const t=tokens(s);return t.length<20?[]:t.slice(0,-3).map((_,i)=>t.slice(i,i+4).join(' '))};
 return overlap(shingle(a),shingle(b));
}
export function classifyRole(text:string):{role:EvidenceRole;confidence:number} {
 const t=text.toLowerCase();
 const role:EvidenceRole=/\b(sponsored|subscribe now|special offer|advertisement)\b/.test(t)?'PROMOTION':/^\s*(opinion|editorial)[:\s]/.test(t)?'OPINION':/^\s*analysis[:\s]/.test(t)?'ANALYSIS':/\b(unconfirmed|unverified|rumou?r)\b/.test(t)?'UNVERIFIED_LEAD':/\b(official statement|press release)\b/.test(t)?'OFFICIAL_STATEMENT':/\b(investigation reveals|investigative report)\b/.test(t)?'INVESTIGATIVE_REPORT':t.trim().length<15?'NOISE':'REPORTED_DEVELOPMENT';
 return {role,confidence:role==='REPORTED_DEVELOPMENT'?.55:.85};
}

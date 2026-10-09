import {tokens} from './policies';
import type {ShortlistCandidate} from './shortlist';
import type {FeedRecord} from './types';
import {OpenRouterJudgmentClient} from './salience';
import type {SemanticQuestion} from './semantic-provider';
import {durableSemanticOperation} from './semantic-operations';
import type {V1FeedStore} from './store';
import type {Env} from '../types';

export interface EditorialRanking {relevance:number;relevanceConfidence:number;source:'LEXICAL_UNKNOWN'|'JEV';novelty:number;freshness:number;materiality:number;continuity:number;support:number;score:number;semanticKey:string;operationId?:string}
/** Lexical match is positive evidence, never proof of irrelevance. No topic dictionaries. */
export function cheapEditorialRanking(feed:Pick<FeedRecord,'title'|'interests'|'geography'>,c:Pick<ShortlistCandidate,'facts'|'flags'|'effects'|'protectedReasons'|'fallbackEditorial'|'sourceTitles'>):EditorialRanking {
 const words=new Set(tokens([...c.facts.map(f=>f.text),...(c.sourceTitles??[])].join(' '))),wanted=[...new Set(tokens([feed.title,...feed.interests,...feed.geography].join(' ')))];
 const overlap=wanted.length?wanted.filter(w=>words.has(w)).length/wanted.length:0;
 const novelty=c.fallbackEditorial.newUnderstanding.length?1:0,freshness=c.flags.includes('OLD_RECAP')?.2:1;
 const materiality=c.effects.some(e=>['CHANGES_STATE','CHANGES_CERTAINTY','CONTRADICTS','CORRECTS','RETRACTS'].includes(e))?1:c.facts.some(f=>/\p{N}/u.test(f.text))?.6:.4;
 const support=Math.min(1,new Set(c.facts.flatMap(f=>f.evidenceRevisionIds)).size/3),continuity=c.fallbackEditorial.previouslyCommunicated.length&&novelty?1:0;
 const relevance=.4+.6*overlap;
 return {relevance,relevanceConfidence:0,source:'LEXICAL_UNKNOWN',novelty,freshness,materiality,continuity,support,score:.5*relevance+.2*novelty+.15*freshness+.1*materiality+.03*continuity+.02*support,semanticKey:c.facts.map(f=>f.text.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim()).sort().join('\n')};
}
export function compareEditorialCandidates(a:{priority:number;protectedReasons:string[];ranking?:EditorialRanking},b:{priority:number;protectedReasons:string[];ranking?:EditorialRanking}):number {
 return Number(b.protectedReasons.length>0)-Number(a.protectedReasons.length>0)||(b.ranking?.score??b.priority)-(a.ranking?.score??a.priority)||(b.ranking?.relevance??0)-(a.ranking?.relevance??0)||(b.ranking?.freshness??0)-(a.ranking?.freshness??0)||(a.ranking?.semanticKey??'').localeCompare(b.ranking?.semanticKey??'');
}
/** At most eight judgments per bounded call; every ordinary candidate is ranked before truncation.
 * Uncertain/failed relevance preserves the cheap high-recall ordering, never drops evidence. */
export async function rankEditorialCandidates(store:V1FeedStore,env:Env,feed:FeedRecord,candidates:ShortlistCandidate[],window:{start:string;end:string},now:string,fetcher:typeof fetch=fetch):Promise<ShortlistCandidate[]> {
 const ranked=candidates.map(c=>({...c,ranking:c.ranking??cheapEditorialRanking(feed,c)}));
 if(!env.OPENROUTER_API_KEY||env.V1_EDITORIAL_RANKING_POLICY!=='SEMANTIC')return ranked;
 const ordered=[...ranked].sort(compareEditorialCandidates),model=env.V1_JEV_SALIENCE_MODEL??'typesafe/jev-1.13';
 for(let offset=0;offset<Math.min(ordered.length,64);offset+=8){
  const batch=ordered.slice(offset,offset+8),state={feed:{title:feed.title,interests:feed.interests,geography:feed.geography},candidates:batch.map((c,i)=>({key:`candidate_${String.fromCharCode(97+i)}`,sourceTitles:c.sourceTitles?.join(' ').slice(0,250),facts:c.facts.map(f=>f.text).join(' ').slice(0,650)}))};
  const questions:Record<string,SemanticQuestion>=Object.fromEntries(batch.map((c,i)=>[`candidate_${String.fromCharCode(97+i)}`,{kind:'SCORE',instructions:`How relevant is this supported development to the Feed: ${[feed.title,...feed.interests].join('; ').slice(0,500)}? Development: ${c.facts.map(f=>f.text).join(' ').slice(0,650)}. Source headline context: ${(c.sourceTitles??[]).join('; ').slice(0,250)}. Judge this development, not other candidates. Topic adjacency alone is weak. Unknown relevance is not irrelevance. Do not assess source popularity.`,levels:['Clearly unrelated','Uncertain or tangential','Directly relevant']} satisfies SemanticQuestion]));
  const client=new OpenRouterJudgmentClient({kind:'JEV',model,apiKey:env.OPENROUTER_API_KEY,maxCalls:1,maxCostUsd:.02,maxCallCostUsd:.02,timeoutMs:10000,fetcher});
  const result=await durableSemanticOperation(store,{feedId:feed.id,feedRevision:feed.revision,evidenceRevisionIds:[...new Set(batch.flatMap(c=>c.evidenceRevisionIds))],kind:'EDITORIAL_RELEVANCE',policyVersion:'high-recall-relevance-v3',model,budgetKey:`ranking:${window.start}:${window.end}`,state},async()=>{const r=await client.decide(state,questions);return {value:r.answers,usage:r.usage}},now,()=>client.usage());
  batch.forEach((c,i)=>{const answer=result.value?.[`candidate_${String.fromCharCode(97+i)}`];if(result.status==='SUCCEEDED'&&answer?.kind==='SCORE'&&answer.confidence>=.6){const old=c.ranking!;c.ranking={...old,relevance:answer.value,relevanceConfidence:answer.confidence,source:'JEV',score:old.score+.5*(answer.value-old.relevance),operationId:result.id}}});
 }
 return ranked;
}

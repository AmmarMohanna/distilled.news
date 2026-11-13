import type {PreparedArticle} from './prepare';
import type {UnaccountedSource} from './types';

/** Reference bookkeeping only: absence is not an editorial relevance or recall verdict. */
export function auditEditorSourceAccounting(raw: unknown, articles: Array<Pick<PreparedArticle, 'ref' | 'id' | 'alsoIds'>>): UnaccountedSource[] {
  const output = raw as {items?: unknown; left_out?: unknown} | null;
  const mentioned = new Set<string>();
  for (const list of [output?.items, output?.left_out]) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (!Array.isArray(row?.sources)) continue;
      for (const ref of row.sources) if (typeof ref === 'string') mentioned.add(ref.replace(/\s+/g, ' ').trim().toUpperCase());
    }
  }
  return articles.filter(article => !mentioned.has(article.ref)).map(article => ({
    ref: article.ref,
    sourceIds: [...new Set([article.id, ...article.alsoIds])]
  }));
}

/** Require explicit editorial choices without inventing their semantic reasons. */
export function assertCompleteEditorAccounting(raw:unknown,articles:Array<Pick<PreparedArticle,'ref'>>):void {
 const output=raw as {items?:any[];left_out?:any[]},known=new Set(articles.map(a=>a.ref)),selected=new Set<string>(),omitted=new Set<string>();
 const refs=(row:any)=>{
  if(!Array.isArray(row?.sources)||!row.sources.length||row.sources.some((r:unknown)=>typeof r!=='string'||!known.has(r.trim().toUpperCase())))throw Error('INVALID_EDITOR_ACCOUNTING: use supplied article labels only');
  return row.sources.map((r:string)=>r.trim().toUpperCase()) as string[];
 };
 for(const row of output.items??[])for(const ref of refs(row))selected.add(ref);
 if(output.left_out!==undefined&&!Array.isArray(output.left_out))throw Error('INVALID_EDITOR_ACCOUNTING: left_out must be an array');
 for(const row of output.left_out??[]){
  if(typeof row?.why!=='string'||!row.why.trim())throw Error('INCOMPLETE_EDITOR_ACCOUNTING: each exclusion requires its actual reason');
  if(/^(?:off[ -]?topic|irrelevant|routine|not relevant|not important|low[ -]value|duplicate|redundant|no news|outside scope)[.!]?$/i.test(row.why.trim()))throw Error('INCOMPLETE_EDITOR_ACCOUNTING: bare labels are not explanations; identify the unrelated topic/location, unchanged fact, or absent new decision in the source');
  for(const ref of refs(row)){
   if(selected.has(ref)||omitted.has(ref))throw Error('CONFLICTING_EDITOR_ACCOUNTING: a source cannot be both selected and excluded or excluded twice');
   omitted.add(ref);
  }
 }
 const missing=articles.filter(a=>!selected.has(a.ref)&&!omitted.has(a.ref)).map(a=>a.ref);
 if(missing.length)throw Error('INCOMPLETE_EDITOR_ACCOUNTING: explicitly select or exclude every supplied source; missing '+missing.join(', '));
}

/** Retain all outcomes when coverage or later stages change an editor's choice. */
export function buildSourceDecisions(ids:string[],prepared:PreparedArticle[],result:Pick<import('./types').BriefingResult,'items'|'omitted'|'dropped'|'skipped'>):import('./types').SourceDecision[]{
 const byId=new Map<string,PreparedArticle>();for(const a of prepared)for(const id of [a.id,...a.alsoIds])byId.set(id,a);
 return [...new Set(ids)].map(sourceId=>{
  const article=byId.get(sourceId),outcomes:import('./types').SourceDecision['outcomes']=[];
  if(article&&article.id!==sourceId)outcomes.push({stage:'preparation',decision:'duplicate',reason:'folded into retained source',headline:article.id});
  for(const skipped of result.skipped)if(skipped.id===sourceId&&skipped.reason!=='duplicate_of_other_article')outcomes.push({stage:'preparation',decision:'skipped',reason:skipped.reason});
  for(const omitted of result.omitted)if(omitted.sourceIds.includes(sourceId))outcomes.push({stage:omitted.stage,decision:omitted.stage==='safety_cap'||omitted.reason==='dropped by consolidation without a reason'?'deferred':'omitted',reason:omitted.reason,...(omitted.headline?{headline:omitted.headline}:{})});
  for(const dropped of result.dropped)if(dropped.sourceIds.includes(sourceId))outcomes.push({stage:'final',decision:dropped.carry?'deferred':'omitted',reason:dropped.reason,headline:dropped.headline});
  for(const item of result.items)if(item.sourceIds.includes(sourceId))outcomes.push({stage:'final',decision:'selected',reason:'independently verified for this edition',headline:item.headline});
  if(!outcomes.some(o=>o.decision!=='duplicate'))outcomes.push({stage:'final',decision:'unresolved',reason:'no explicit final disposition; retain for later consideration'});
  return {sourceId,...(article?{preparedRef:article.ref,...(article.id!==sourceId?{duplicateOf:article.id}:{})}:{}),outcomes};
 });
}

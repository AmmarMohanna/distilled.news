import {type Case,type Item,type Prior,check,validateCase} from './protocol';

interface Document {id:string;feed_id:string;kind:string;json:string}
interface FrozenInput {id:string;feedId:string;input:{feed:{interest:string;language:'en'|'ar'|'fr'};articles:Array<{id:string;source:string;title?:string;text:string;publishedAt?:string}>;prior?:Prior[];windowStart:string;windowEnd:string}}
interface Edition {id:string;feedId:string;language:'en'|'ar'|'fr';engine?:string;windowStart:string;windowEnd:string;createdAt:string;stories:Array<{claims:Array<{text:string;support:Array<{evidenceRevisionId:string}>}>}>}
export interface Published {id:string;feed_id:string;published_at:string;language:string;window_end:string}

/** SOURCE_DB is deliberately used only by SELECTs in this file. Bindings do not
 * enforce read-only permissions: keep this adapter auditable and separately tested. */
export async function discover(db:D1Database,since:string,after:string,limit=50){
 return (await db.prepare(`SELECT e.id,e.feed_id,json_extract(p.json,'$.publishedAt') published_at,
 json_extract(e.json,'$.language') language,json_extract(e.json,'$.windowEnd') window_end
 FROM v1_feed_documents e JOIN v1_feed_documents p ON p.kind='publication_status' AND p.id=e.id AND p.feed_id=e.feed_id
 WHERE e.kind='editions' AND json_extract(p.json,'$.status')='PUBLISHED'
 AND json_extract(p.json,'$.publishedAt')>=? AND e.id>?
 ORDER BY e.id LIMIT ?`).bind(since,after,limit).all<Published>()).results;
}
export async function isPublished(db:D1Database,feedId:string,id:string){const row=await db.prepare("SELECT json FROM v1_feed_documents WHERE kind='publication_status' AND feed_id=? AND id=?").bind(feedId,id).first<{json:string}>();return !!row&&JSON.parse(row.json).status==='PUBLISHED'}
export async function snapshot(db:D1Database,row:Published,label:string,now:string):Promise<Case>{
 const docs=(await db.prepare("SELECT id,feed_id,kind,json FROM v1_feed_documents WHERE feed_id=? AND id=? AND kind IN ('editions','v3_window_inputs','publication_status')").bind(row.feed_id,row.id).all<Document>()).results;
 const parsed=new Map(docs.map(d=>[d.kind,JSON.parse(d.json)]));
 const edition=parsed.get('editions') as Edition|undefined,frozen=parsed.get('v3_window_inputs') as FrozenInput|undefined,status=parsed.get('publication_status') as {status:string;publishedAt:string}|undefined;
 check(edition&&status?.status==='PUBLISHED','PUBLICATION_NO_LONGER_VISIBLE');
 check(edition.id===row.id&&edition.feedId===row.feed_id,'EDITION_SCOPE_MISMATCH');
 check(edition.engine==='v3'&&frozen,'UNASSESSABLE_NO_FROZEN_V3_INPUT');
 check(frozen.id===row.id&&frozen.feedId===row.feed_id&&frozen.input.feed.language===edition.language&&frozen.input.windowStart===edition.windowStart&&frozen.input.windowEnd===edition.windowEnd,'FROZEN_INPUT_MISMATCH');
 check(Array.isArray(frozen.input.prior),'ACTUAL_PRIOR_HISTORY_UNAVAILABLE');
 // Full eligible input set, including uncited and omitted articles. The frozen
 // input is the actual engine admission set, not a guess from publication citations.
 const revisions=new Map<string,{id:string;feedId:string;contentCompleteness?:string;body?:string;title?:string}>();
 const ids=frozen.input.articles.map(a=>a.id);check(new Set(ids).size===ids.length,'DUPLICATE_SOURCE_ID');
 for(let offset=0;offset<ids.length;offset+=70){const part=ids.slice(offset,offset+70);
  const rows=(await db.prepare(`SELECT r.json FROM v1_revisions r JOIN v1_intake_scopes s ON s.id=r.feed_source_id WHERE s.feed_id=? AND r.id IN (${part.map(()=>'?').join(',')})`).bind(row.feed_id,...part).all<{json:string}>()).results;
  for(const row of rows){const r=JSON.parse(row.json) as {id:string;feedId:string;contentCompleteness?:string;body?:string;title?:string};revisions.set(r.id,r)}
 }
 const articles=frozen.input.articles.map(a=>{const r=revisions.get(a.id);check(!r||r.feedId===row.feed_id,'REVISION_SCOPE_MISMATCH');
  const exact=!!r&&(r.body??r.title??'')===a.text;
  const completeness=!a.text?'missing':!r||!exact?'unknown':r.contentCompleteness==='COMPLETE'?'complete':r.contentCompleteness==='PARTIAL'?'partial':'unknown';
  return {id:a.id,feedId:row.feed_id,text:a.text||null,title:a.title,publishedAt:a.publishedAt,completeness} as Case['articles'][number];
 });
 const items:Item[]=edition.stories.map(story=>({headline:'',body:story.claims.map(c=>c.text).join('\n'),sourceIds:[...new Set(story.claims.flatMap(c=>c.support.map(s=>s.evidenceRevisionId)))]}));
 const evidenceComplete=articles.every(a=>a.completeness==='complete');
 const result:Case={id:row.id,feedId:row.feed_id,language:edition.language,interest:frozen.input.feed.interest,windowStart:edition.windowStart,windowEnd:edition.windowEnd,frozenAt:now,evidenceScope:'all_eligible_frozen_input',evidenceComplete,articles,prior:frozen.input.prior??[],items,pipelineStatus:'published',publishedAt:status.publishedAt,sourceLabel:label,
 limitations:evidenceComplete?[]:['Some original article bodies are incomplete, missing, changed or unlabelled; quality cannot be certified against unavailable evidence.']};
 check(await isPublished(db,row.feed_id,row.id),'PUBLICATION_NO_LONGER_VISIBLE');return validateCase(result);
}

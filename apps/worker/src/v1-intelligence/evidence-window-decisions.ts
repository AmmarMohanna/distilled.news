import {HandoffError} from '@distilled/contracts';
import type {BriefingResult} from '@distilled/briefing';
import type {V1FeedStore} from './store';

export interface EvidenceWindowDecisions {retry:Set<string>;resolved:Set<string>;selected:Set<string>;overflow:Set<string>}
type Disposition='RESOLVED'|'SELECTED'|'UNACCOUNTED'|'OVERFLOW';
type ResultDecisions=Pick<BriefingResult,'items'|'skipped'|'omitted'|'dropped'>;
function classify(result:ResultDecisions,wanted:Set<string>):Map<string,Disposition>{
 const values=new Map<string,Disposition>();
 const mark=(ids:unknown,disposition:Disposition)=>{if(Array.isArray(ids))for(const id of ids)if(typeof id==='string'&&wanted.has(id))values.set(id,disposition)};
 for(const s of result.skipped)if(s.reason!=='duplicate_of_other_article')mark([s.id],'RESOLVED');
 for(const o of result.omitted)if(o.stage!=='safety_cap'&&o.reason!=='dropped by consolidation without a reason')mark(o.sourceIds,'RESOLVED');
 for(const d of result.dropped)mark(d.sourceIds,'RESOLVED');
 for(const i of result.items)mark(i.sourceIds,'SELECTED');
 for(const o of result.omitted)if(o.stage==='safety_cap')mark(o.sourceIds,'OVERFLOW');
 return values;
}

/** Explicit decisions are distinct from reader communication. Selected verified
 * sources remain unresolved until published. Unaccounted input is not a judgment. */
export async function readEvidenceWindowDecisions(store:V1FeedStore,feedId:string,ids:string[],through?:string,includeResolved=true):Promise<EvidenceWindowDecisions>{
 const wanted=[...new Set(ids)],state:EvidenceWindowDecisions={retry:new Set(),resolved:new Set(),selected:new Set(),overflow:new Set()};
 if(!wanted.length)return state;
 if(through!==undefined&&!Number.isFinite(Date.parse(through)))throw new HandoffError('INVALID_REQUEST');
 let indexed=true,generation:number|undefined;
 const decisions:{revision_id:string;window_end:string;carry:number;result_id:string}[]=[];
 for(let offset=0;offset<wanted.length;offset+=90){
  let rows:D1Result<{marker:number;revision_id:string|null;window_end:string|null;carry:number|null;result_id:string|null;ready:number|null;version:number|null}>;
  try{rows=await store.db.prepare(`WITH carry_state AS MATERIALIZED (
   SELECT COALESCE(s.ready,0) ready,COALESCE(s.version,0) version FROM (SELECT ? feed_id) f LEFT JOIN v3_carry_index_state s ON s.feed_id=f.feed_id
  ), candidates AS MATERIALIZED (
   SELECT requested.value revision_id FROM json_each(?) requested WHERE (SELECT ready FROM carry_state)=1 AND EXISTS(
    SELECT 1 FROM v3_carry_decisions p WHERE p.feed_id=? AND p.revision_id=requested.value ${includeResolved?'':'AND p.carry=1'})
  ) SELECT 1 marker,NULL revision_id,NULL window_end,NULL carry,NULL result_id,ready,version FROM carry_state
  UNION ALL SELECT 0,d.revision_id,d.window_end,d.carry,d.result_id,NULL,NULL
   FROM candidates c CROSS JOIN v3_carry_decisions d ON d.feed_id=? AND d.revision_id=c.revision_id
   WHERE (? IS NULL OR julianday(d.window_end)<=julianday(?))
  ORDER BY marker DESC,result_id`).bind(feedId,JSON.stringify(wanted.slice(offset,offset+90)),feedId,feedId,through??null,through??null).all();}
  catch(error){if(!/no such table.*v3_carry_(index_state|decisions)/.test(String(error)))throw error;indexed=false;break;}
  const marker=rows.results[0];if(!marker||marker.marker!==1)throw new HandoffError('TEMPORARY_UNAVAILABLE');
  if(marker.ready!==1){indexed=false;break;}
  if(generation!==undefined&&marker.version!==generation)throw new HandoffError('TEMPORARY_UNAVAILABLE');generation=marker.version!;
  for(const row of rows.results.slice(1))decisions.push({revision_id:row.revision_id!,window_end:row.window_end!,carry:row.carry!,result_id:row.result_id!});
 }
 const apply=(id:string,carry:boolean,disposition:Disposition)=>{
  if(!carry&&disposition==='UNACCOUNTED')return;
  state.retry.delete(id);state.resolved.delete(id);state.selected.delete(id);state.overflow.delete(id);
  if(carry||disposition==='OVERFLOW'){state.retry.add(id);if(!carry)state.overflow.add(id)}
  else (disposition==='SELECTED'?state.selected:state.resolved).add(id);
 };
 if(indexed){
  const dispositions=new Map<string,Map<string,Disposition>>();
  const resultIds=includeResolved?[...new Set(decisions.filter(d=>d.carry===0).map(d=>d.result_id))]:[],candidates=new Set(wanted);
  // Read compact reference/decision metadata once per relevant result across
  // all candidate pages. Never transfer unrelated source or historical prose.
  for(let offset=0;offset<resultIds.length;offset+=89){
   const page=resultIds.slice(offset,offset+89),rows=await store.db.prepare(`SELECT r.id,r.feed_id,
    (SELECT json_group_array(json_object('sourceIds',json_extract(i.value,'$.sourceIds'))) FROM json_each(r.json,'$.result.items') i) items,
    (SELECT json_group_array(json_object('id',json_extract(s.value,'$.id'),'reason',json_extract(s.value,'$.reason'))) FROM json_each(r.json,'$.result.skipped') s) skipped,
    (SELECT json_group_array(json_object('sourceIds',json_extract(o.value,'$.sourceIds'),'stage',json_extract(o.value,'$.stage'),'reason',json_extract(o.value,'$.reason'))) FROM json_each(r.json,'$.result.omitted') o) omitted,
    (SELECT json_group_array(json_object('sourceIds',json_extract(d.value,'$.sourceIds'),'carry',json_extract(d.value,'$.carry'))) FROM json_each(r.json,'$.result.dropped') d) dropped
    FROM v1_feed_documents r WHERE r.feed_id=? AND r.kind='v3_window_results' AND r.id IN (${page.map(()=>'?').join(',')})`).bind(feedId,...page).all<{id:string;feed_id:string;items:string;skipped:string;omitted:string;dropped:string}>();
   for(const r of rows.results){if(r.feed_id!==feedId)throw new HandoffError('SCOPE_DENIED');dispositions.set(r.id,classify({items:JSON.parse(r.items),skipped:JSON.parse(r.skipped),omitted:JSON.parse(r.omitted),dropped:JSON.parse(r.dropped)},candidates));}
  }
  if(resultIds.length){
   const current=await store.db.prepare('SELECT ready,version FROM v3_carry_index_state WHERE feed_id=?').bind(feedId).first<{ready:number;version:number}>();
   if(current?.ready!==1||current.version!==generation)throw new HandoffError('TEMPORARY_UNAVAILABLE');
  }
  // Stable date ordering retains the original binary result-ID tie order.
  for(const d of decisions.sort((a,b)=>a.window_end.localeCompare(b.window_end)))apply(d.revision_id,Boolean(d.carry),includeResolved?dispositions.get(d.result_id)?.get(d.revision_id)??'UNACCOUNTED':'RESOLVED');
 }else{
  const candidates=new Set(wanted),rows=await store.list<{windowEnd:string;result:ResultDecisions}>(feedId,'v3_window_results');
  for(const p of rows.sort((a,b)=>a.windowEnd.localeCompare(b.windowEnd))){
   const at=Date.parse(p.windowEnd);if(through!==undefined&&(!Number.isFinite(at)||at>Date.parse(through)))continue;
   const dispositions=includeResolved?classify(p.result,candidates):new Map<string,Disposition>();
   const retry=new Set(p.result.dropped.filter(d=>d.carry).flatMap(d=>d.sourceIds));
   const touched=new Set([...p.result.items.flatMap(i=>i.sourceIds),...p.result.skipped.map(s=>s.id),...p.result.omitted.flatMap(o=>o.sourceIds),...p.result.dropped.flatMap(d=>d.sourceIds)]);
   for(const id of touched)if(candidates.has(id))apply(id,retry.has(id),includeResolved?dispositions.get(id)??'UNACCOUNTED':'RESOLVED');
  }
 }
 return state;
}

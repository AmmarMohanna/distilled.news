import type {Env} from './types';
/** Compatibility-only retirement. No admission, collection, window creation,
 * publication, continuations or provider calls remain in this module. */
export interface ManualBriefingRequest {
 id:string;feedId:string;sourceIds:string[];createdAt:string;state:'PENDING'|'DONE'|'FAILED';
 phase:'COLLECTION'|'PROCESSING';scheduled?:{id:string;scheduler:string;sourceId:string}[];
 window?:{start:string;end:string;kind:string};briefingRequestId?:string;result?:string;reason?:string;
}
export async function retireManualBriefing(env:Env,feedId:string,id:string):Promise<void>{
 // This isolated compatibility document update cannot modify graph, accepted
 // evidence or existing publication requests (which remain on the normal relay).
 await env.DB.prepare(`UPDATE v1_feed_documents SET json=json_set(json,'$.state','FAILED','$.reason','MANUAL_GENERATION_RETIRED')
 WHERE kind='manual_briefing_requests' AND feed_id=? AND id=? AND json_extract(json,'$.state')='PENDING'`).bind(feedId,id).run();
}
export async function retireManualBriefingRequests(env:Env):Promise<void>{
 const rows=await env.DB.prepare("SELECT feed_id,id FROM v1_feed_documents WHERE kind='manual_briefing_requests' AND json_extract(json,'$.state')='PENDING' ORDER BY json_extract(json,'$.createdAt'),id LIMIT 10").all<{feed_id:string;id:string}>();
 for(const row of rows.results)await retireManualBriefing(env,row.feed_id,row.id);
}

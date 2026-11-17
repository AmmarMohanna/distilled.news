import {sha256} from '@distilled/contracts';
import type {ConnectorBatch} from '@distilled/connectors';
import {canonicalJson} from '../v1-intake/canonical';
import type {PublicationWindow} from './scoring';
export const CANARY_SOURCES=[
 {id:'bbc-world',title:'BBC World',url:'https://feeds.bbci.co.uk/news/world/rss.xml',approval:'EXISTING_APPROVED_CONFIGURATION'},
 {id:'aljazeera-all',title:'Al Jazeera English',url:'https://www.aljazeera.com/xml/rss/all.xml',approval:'USER_APPROVED_LOCAL_CANARY_2026-10-04'},
 {id:'dw-world',title:'DW World',url:'https://rss.dw.com/rdf/rss-en-world',approval:'USER_APPROVED_LOCAL_CANARY_2026-10-04'},
] as const;
export type CanaryItem=ConnectorBatch['observations'][number] & {canarySourceId?:string};
export async function freezeRssCorpus(rows:CanaryItem[],observedAt:string,maxItems=40){
 const end=Date.parse(observedAt);if(!Number.isFinite(end)||!Number.isInteger(maxItems)||maxItems<1||maxItems>40)throw Error('INVALID_CANARY_BOUNDS');
 const start=end-86400000,excluded:{item:CanaryItem;reason:string}[]=[],valid:CanaryItem[]=[],seen=new Set<string>();
 for(const item of rows){const t=Date.parse(item.publishedAt??'');let reason:string|undefined;
  if(item.timestampKind!=='published'||!Number.isFinite(t))reason='MISSING_PUBLISHED_TIME';else if(t<start||t>=end)reason='OUTSIDE_WINDOW';else if(seen.has(JSON.stringify([item.canarySourceId,item.upstreamId])))reason='DUPLICATE_SOURCE_ITEM';
  if(reason)excluded.push({item,reason});else{seen.add(JSON.stringify([item.canarySourceId,item.upstreamId]));valid.push(structuredClone(item))}
 }
 valid.sort((a,b)=>Date.parse(a.publishedAt!)-Date.parse(b.publishedAt!)||`${a.canarySourceId??''}:${a.upstreamId}`.localeCompare(`${b.canarySourceId??''}:${b.upstreamId}`));
 excluded.push(...valid.slice(maxItems).map(item=>({item,reason:'ITEM_CAP'})));
 const items=valid.slice(0,maxItems);return {schemaVersion:'real-rss-canary-v1',start:new Date(start).toISOString(),end:new Date(end).toISOString(),items,excluded,hash:await sha256(canonicalJson(items)),coverage:'PARTIAL' as const,arrivalPolicy:'PUBLISHED_TIME_PROXY_NOT_OBSERVED_ARRIVAL',representation:'ARTICLE_EXCERPT_NOT_FULL_ARTICLE'};
}
export function canaryWindows(start:string,end:string,durationMinutes:30|120|360|1440):PublicationWindow[]{
 const a=Date.parse(start),b=Date.parse(end),step=durationMinutes*60000;if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)throw Error('INVALID_CANARY_WINDOWS');
 // Existing runtime accepts canonical calendar-anchored windows only. Pad the
 // simulation to enclosing UTC boundaries, never fabricate additional items.
 const result:PublicationWindow[]=[];for(let t=Math.floor(a/step)*step;t<b;t+=step)result.push({start:new Date(t).toISOString(),end:new Date(t+step).toISOString(),kind:durationMinutes===30?'30M':durationMinutes===1440?'DAILY':'HOURLY',durationMinutes,timezone:'UTC',deliveryAnchor:'00:00',schedulePolicy:'local-calendar-anchors-v1'});return result;
}
export function mechanicalRepeatMetrics(editions:string[][]){
 const seen=new Set<string>();let claimCount=0,exactRepeatedClaims=0;for(const claims of editions){for(const claim of claims){const key=claim.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();claimCount++;if(seen.has(key))exactRepeatedClaims++}claims.forEach(claim=>seen.add(claim.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase()))}
 return {claimCount,exactRepeatedClaims,exactRepeatRate:claimCount?exactRepeatedClaims/claimCount:null,humanUnnecessaryRepeatRate:null,humanQuality:'PENDING_HUMAN_LABELS'};
}
export function assertFrozenArm(expectedHash:string,expectedIds:string[],actualHash:string,actualIds:string[]):void {
 if(expectedHash!==actualHash||new Set(expectedIds).size!==expectedIds.length||new Set(actualIds).size!==actualIds.length||actualIds.length!==expectedIds.length||actualIds.some(id=>!expectedIds.includes(id)))throw Error('SCORER_INPUT_MISMATCH');
}

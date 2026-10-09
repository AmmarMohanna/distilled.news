import type {EvidenceRevision} from '@distilled/contracts';

/** Source time, observation time and reader time are different things. An older
 * article that the Feed only just accepted is observed now but is not a new
 * development now. STALE is relative to the window being assembled, never a
 * fixed forgetting period; UNKNOWN (no publication time) is never treated as old. */
export type FreshnessState='CURRENT'|'STALE'|'UNKNOWN';
export interface Freshness {
 state:FreshnessState;
 /** Latest known source publication time across the supporting evidence. */
 sourcePublishedAt?:string;
 /** First time any supporting revision was accepted by this Feed. */
 firstSeenByFeedAt:string;
 /** Most recent acceptance of supporting evidence. */
 observedAt:string;
 /** Milliseconds the newest source predates the window start. */
 staleByMs?:number;
}
const MIN_HORIZON_MS=24*3600*1000;
export function assessFreshness(evidence:Pick<EvidenceRevision,'publishedAt'|'acceptedAt'>[],window:{start:string;end:string}):Freshness {
 const accepted=evidence.map(e=>Date.parse(e.acceptedAt)).filter(Number.isFinite),published=evidence.map(e=>e.publishedAt?Date.parse(e.publishedAt):NaN);
 const firstSeenByFeedAt=new Date(accepted.length?Math.min(...accepted):Date.parse(window.end)).toISOString(),observedAt=new Date(accepted.length?Math.max(...accepted):Date.parse(window.end)).toISOString();
 // Any revision without a usable publication time makes recency unknowable.
 if(!evidence.length||published.some(p=>!Number.isFinite(p)))return {state:'UNKNOWN',firstSeenByFeedAt,observedAt};
 const newest=Math.max(...published),start=Date.parse(window.start),horizon=Math.max(MIN_HORIZON_MS,Date.parse(window.end)-start),staleByMs=start-newest;
 return {state:staleByMs>horizon?'STALE':'CURRENT',sourcePublishedAt:new Date(newest).toISOString(),firstSeenByFeedAt,observedAt,staleByMs:staleByMs>0?staleByMs:undefined};
}

/** Dates from source metadata are reporting dates, never inferred event dates.
 * Apply the same window-relative freshness horizon to each approved fact, even
 * for a Feed's first edition or a protected change. */
export interface FactTiming {
 sourcePublishedAt?:string;
 eventTime?:string;
 reportTime?:string;
 firstSeenByFeedAt:string;
 observedAt:string;
 framingRequired:boolean;
}
export function factTiming(evidence:Pick<EvidenceRevision,'publishedAt'|'acceptedAt'>[],window:{start:string;end:string},fact:{reportTime?:string;eventTime?:string}={}):FactTiming {
 const freshness=assessFreshness(evidence,window);
 // Foundation ClaimMentions retain acceptedAt as a historical reportTime
 // fallback. It is an observation timestamp, never proof of a report date.
 const reportTime=fact.reportTime&&evidence.some(e=>e.publishedAt&&Number.isFinite(Date.parse(e.publishedAt))&&Date.parse(e.publishedAt)===Date.parse(fact.reportTime!))?fact.reportTime:undefined;
 return {sourcePublishedAt:freshness.sourcePublishedAt,reportTime,eventTime:fact.eventTime,firstSeenByFeedAt:freshness.firstSeenByFeedAt,observedAt:freshness.observedAt,framingRequired:freshness.state==='STALE'};
}

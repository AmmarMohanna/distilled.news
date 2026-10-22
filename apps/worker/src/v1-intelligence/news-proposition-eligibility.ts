import type {EvidenceRevision} from '@distilled/contracts';
export interface NewsRegion {revisionId:string;contentHash:string;field:'body'|'title';start:number;end:number;role:'NAVIGATION'|'ARTICLE';provenance:'PARSER_STRUCTURE'|'HUMAN_REVIEWED_BOUNDARY'}
/** Derived eligibility only. Raw evidence is never changed, and a textual
 * date/Published token alone cannot establish a navigation boundary. */
export function classifyNewsPropositionEligibility(revision:Pick<EvidenceRevision,'id'|'contentHash'|'body'|'title'>,span:{field:'body'|'title';start:number;end:number},regions:NewsRegion[]){
 const source=revision[span.field]??'';
 if(span.start<0||span.end>source.length||span.end<=span.start)throw Error('ELIGIBILITY_SPAN_INVALID');
 for(const r of regions)if(r.revisionId!==revision.id||r.contentHash!==revision.contentHash||r.start<0||r.end<r.start||r.end>(revision[r.field]?.length??0)||!['PARSER_STRUCTURE','HUMAN_REVIEWED_BOUNDARY'].includes(r.provenance))throw Error('ELIGIBILITY_REGION_INVALID');
 const matching=regions.filter(r=>r.field===span.field&&span.start>=r.start&&span.end<=r.end),roles=new Set(matching.map(r=>r.role));
 const status=roles.size>1?'UNRESOLVED':roles.has('NAVIGATION')?'NOT_NEWS':roles.has('ARTICLE')?'ELIGIBLE':/^\s*(?:Published:|Related (?:links|reading):)/i.test(source.slice(span.start,span.end))?'UNRESOLVED':'ELIGIBLE';
 return {status,policyVersion:'source-region-eligibility-v1',evidenceRevisionId:revision.id,contentHash:revision.contentHash,span,regions:matching} as const;
}

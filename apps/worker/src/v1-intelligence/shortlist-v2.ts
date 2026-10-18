import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,type V1FeedStore} from './store';
import type {ShortlistRecord} from './shortlist';
import {classifyNewsPropositionEligibility,type NewsRegion} from './news-proposition-eligibility';
/** Versioned derived projection. An absent parser boundary never licenses
 * automatic removal of an ambiguous historical flattened navigation fragment. */
export async function prepareV2Shortlist(store:V1FeedStore,original:ShortlistRecord,persist=true):Promise<ShortlistRecord>{
 const value=structuredClone(original),regions=await store.list<{id:string;evidenceRevisionId:string;regions:NewsRegion[]}>(original.feedId,'source_region_eligibility');
 const revisions=new Map(await Promise.all([...new Set([...value.candidates,...value.overflow].flatMap(c=>c.facts.flatMap(f=>f.evidenceRevisionIds)))].map(async id=>[id,await store.revision(original.feedId,id)] as const)));
 for(const c of [...value.candidates,...value.overflow])for(const fact of c.facts){
  const results=[];
  for(const id of fact.evidenceRevisionIds){const revision=revisions.get(id);if(!revision)throw Error('V2_SOURCE_REVISION_MISSING');
   const field=revision.title?.includes(fact.text)?'title':revision.body?.includes(fact.text)?'body':undefined;
   if(!field){results.push({status:'UNRESOLVED'});continue;}
   const start=revision[field]!.indexOf(fact.text),end=start+fact.text.length;
   if(revision[field]!.indexOf(fact.text,start+1)>=0){results.push({status:'UNRESOLVED'});continue;}
   results.push(classifyNewsPropositionEligibility(revision,{field,start,end},regions.filter(r=>r.evidenceRevisionId===id).flatMap(r=>r.regions)));
  }
  fact.newsEligibility={policyVersion:'source-region-eligibility-v1',status:results.length&&results.every(r=>r.status==='NOT_NEWS')?'NOT_NEWS':results.some(r=>r.status==='ELIGIBLE')?'ELIGIBLE':'UNRESOLVED'};
 }
 value.policyVersion=original.policyVersion+':evidence-grounded-v2';value.id=await sha256(canonicalJson({source:original.id,policy:value.policyVersion,projection:value.candidates.map(c=>c.facts.map(f=>({id:f.id,eligibility:f.newsEligibility})))}));
 if(persist)await feedTransact(store,value.feedId,async tx=>{if(tx.snapshot.feed.revision!==value.feedRevision)throw Error('EDITORIAL_SNAPSHOT_CHANGED');if(!await tx.read('shortlists',value.id))await tx.write('shortlists',value.id,value);});
 return value;
}

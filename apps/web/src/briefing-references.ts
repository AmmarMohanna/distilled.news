import type {BriefingEdition} from '@distilled/core';

/** Reader reference numbers identify individual retained sources, not stories. */
export function briefingReferences(edition: Pick<BriefingEdition,'sections'>) {
 return edition.sections.flatMap((section,sectionIndex)=>
  Array.from({length:Math.max(1,section.evidence.length)},(_,evidenceIndex)=>({sectionIndex,evidenceIndex}))
 ).map((reference,index)=>({...reference,number:index+1}));
}

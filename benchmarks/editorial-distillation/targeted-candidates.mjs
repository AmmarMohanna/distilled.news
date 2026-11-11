import {isDeepStrictEqual} from 'node:util';
export const targetedCandidates = [
 {id:'explicit-source-accounting',stage:'editor',instruction:'Every supplied article reference must occur in items.sources or left_out.sources. Group refs with the same exclusion reason; use one short reason. Accounting does not require publishing each source: duplicates, irrelevant, optional or lower-priority material may be left out. Preserve distinct consequential new developments.'},
 {id:'useful-information-density',stage:'editor',instruction:'Communicate the main change and only the supporting evidence needed to understand it accurately. Omit optional elaboration, repeated headline content and background that does not change that understanding. Keep essential attribution, uncertainty, conditions and disagreements; do not add analysis or consequences absent from the evidence.'},
 {id:'quantity-and-commitment',stage:'verify',instruction:'A fixed amount conditional on approval is not an up-to range; a proposed or future commitment is not a completed allocation. Check these meanings in the headline and body together. Accept concise paraphrases preserving the quantity, condition and timing; do not demand optional background.'}
];
/** Offline candidate only. The named V4 system must match exactly. No combined candidate is available. */
export function targetedRequest(baseline,candidateId,systems){
 const c=targetedCandidates.find(c=>c.id===candidateId);if(!c)throw Error('UNQUALIFIED_OR_COMBINED_CANDIDATE');
 if(baseline.system!==systems[c.stage])throw Error('FROZEN_V4_BASELINE_REQUIRED');
 return {...baseline,system:baseline.system+'\n\n'+c.instruction};
}
export function auditTargetedPair(baseline,changed,candidateId,systems){
 if(!isDeepStrictEqual(changed,targetedRequest(baseline,candidateId,systems)))throw Error('UNCONTROLLED_TARGETED_COMPARISON');
 return {identicalInputAndSettings:true,onlyCandidateInstructionChanged:true};
}

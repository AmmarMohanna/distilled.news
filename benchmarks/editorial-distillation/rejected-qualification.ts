import {EDITOR_SYSTEM_V7,CONSOLIDATE_SYSTEM_V7,VERIFY_SYSTEM_V7,REPAIR_SYSTEM_V7} from '../../packages/briefing/src/prompts-v7';
/** Measured qualification candidate: not accepted; offline reproduction only. */
export type V7Experiment = 'qualifications';
export const V7_QUALIFICATION_CHECK = `Before returning a compressed or translated item, compare each amount, status and right with its supporting source clause. Keep a condition attached to the proposition it qualifies; distinguish a future or proposed action from its completion, a fixed amount from a range, and permission to redact information from authority to veto publication. Preserve these distinctions in the headline and the requested language. Omit optional detail rather than an essential qualification; no extra background or longer body is required.`;
export function archivedV7System(stage: 'editor' | 'consolidate' | 'verify' | 'repair', experiment?: V7Experiment): string {
  const base = {editor: EDITOR_SYSTEM_V7, consolidate: CONSOLIDATE_SYSTEM_V7, verify: VERIFY_SYSTEM_V7, repair: REPAIR_SYSTEM_V7}[stage];
  return experiment === 'qualifications' && stage !== 'verify' ? base + '\n\n' + V7_QUALIFICATION_CHECK : base;
}

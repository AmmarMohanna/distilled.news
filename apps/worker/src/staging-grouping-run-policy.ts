/** Staging-only request envelopes, not provider capability or authorization changes.
 * Above these bounds existing admission stops before purchase; no fact truncation. */
export const STAGING_GROUPING_RUN_POLICY='autonomous-publication-v1';
export const STAGING_DISPOSITION_ATTEMPT_ID='autonomous-20261019-7';
export const STAGING_GROUPING_CEILING_USD=.20;
export const STAGING_GROUPING_CALL_LIMITS={'openai/gpt-4.1-mini':20,'typesafe/jev-1.13':8}; // Prior 15 GPT/7 Jev, at most 5 GPT/1 Jev new calls.
export const STAGING_GROUPING_CAPABILITIES={
 'openai/gpt-4.1-mini':{contextTokens:32768,maxOutputTokens:8192,inputUsdPerToken:.0000004,outputUsdPerToken:.0000016,source:'staging-operator-request-envelope-within-verified-openrouter-catalog-2026-10-12'},
 'typesafe/jev-1.13':{contextTokens:64000,maxOutputTokens:0,inputUsdPerToken:.000000042,outputUsdPerToken:0,transport:'DECISIONS',source:'openrouter-model-page-2026-10-12-decisions'}
};
export const STAGING_GROUPING_CAPABILITIES_JSON=JSON.stringify(STAGING_GROUPING_CAPABILITIES);

/** Explicitly authorized fresh operator work, never a reset of an old attempt. */
export async function freshStagingRematch(request:import('./v1-intelligence/rematch').RematchRequest,scope:string,at:string){
 const {sha256}=await import('@distilled/contracts');
 return {...request,id:await sha256(JSON.stringify([request.id,scope])),createdAt:at,operatorAttemptScope:scope,previousRequestId:request.id};
}

export const STAGING_REUSE_REVIEW_SCOPE='autonomous-20261019-2';

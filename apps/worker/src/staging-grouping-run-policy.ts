/** Staging-only request envelopes, not provider capability or authorization changes.
 * Above these bounds existing admission stops before purchase; no fact truncation. */
export const STAGING_GROUPING_RUN_POLICY='article-first-single-attempt-v1';
export const STAGING_DISPOSITION_ATTEMPT_ID='article-first-20261019-1';
export const STAGING_GROUPING_CEILING_USD=.20;
export const STAGING_GROUPING_CALL_LIMITS={'openai/gpt-4.1-mini':14,'typesafe/jev-1.13':3}; // 7 settled historical calls + at most 7 new GPT calls
export const STAGING_GROUPING_CAPABILITIES={
 'openai/gpt-4.1-mini':{contextTokens:32768,maxOutputTokens:8192,inputUsdPerToken:.0000004,outputUsdPerToken:.0000016,source:'staging-operator-request-envelope-within-verified-openrouter-catalog-2026-10-12'},
 'typesafe/jev-1.13':{contextTokens:64000,maxOutputTokens:0,inputUsdPerToken:.000000042,outputUsdPerToken:0,transport:'DECISIONS',source:'openrouter-model-page-2026-10-12-decisions'}
};
export const STAGING_GROUPING_CAPABILITIES_JSON=JSON.stringify(STAGING_GROUPING_CAPABILITIES);

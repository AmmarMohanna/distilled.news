# QA acquisition trace — October 27, 2026

Feed: When AI Goes Rogue: The Agent Incident Files (`briefing_1879e953-cbbc-462e-a591-7e88f3e0ea83`).

The initial eight OpenAI failures exhausted five acquisition claims and ended as `RECOVERY_EXHAUSTED`. Queue outcomes recorded `TEMPORARY_UNAVAILABLE`, without an underlying exception; no provider receipts existed for the OpenAI source before recovery.

Root cause reproduced locally: the 15 MB article transport configuration was passed through `sharedPublicHttp`, which still rejected configured limits above 10 MB with `INVALID_HTTP_LIMITS`. The router converted this unexpected exception into `TEMPORARY_UNAVAILABLE`; interrupted claims consumed the recovery allowance. This occurs before HTTP dispatch or fallback. It can affect other feeds using the same full-article path; it is not specific to OpenAI.

Correction: the cache now uses the exported article limit constant. Default general requests remain 2 MB. Regression coverage reproduces the failing configuration, accepts/caches an 8 MB response with the article limit, and preserves general/default and maximum-limit guards. Before correction: one regression failed with `INVALID_HTTP_LIMITS`. After correction: 48 focused tests and Worker TypeScript passed. Commit `0b4dcbc` was deployed to sources-QA, retaining live image configuration, secrets, storage and accounting. Frontend and reader HTTP checks passed.

One failed OpenAI job was reopened with the operator's existing one-attempt recovery API under `qa-cache-limit-fix-20261027`. Prior attempts and failure history remain. Its retry advanced into the fallback path and created a durable Zyte operation; a concurrent delivery reported `HELPER_CAPACITY_WAIT`. That intermediate state is not successful article acquisition. Provider response and final acquisition state must be checked separately before claiming recovery.

Private diagnostics remain under `.local-reports/aya-ghada-qa-deploy/`. No retained article text or credentials are included in this report.

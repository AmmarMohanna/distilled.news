# Guardian HTTP 406 acquisition recovery

October 22, 2026; branch `aya-fixes-sources-v3`; code commit `5ccf68b`.

The World News QA feed's acquisition records showed HTTP 406 classified as
`UNSUPPORTED / UPSTREAM_HTTP_ERROR`, exhausted after one attempt. Two sampled
failed URLs returned 200 with both tested Accept headers from the local machine.
This establishes request-path/timing differences, not the publisher's precise
rejection mechanism. Failed response bodies were not retained. RSS collection
and article acquisition are separate; RSS success does not prove article access.

The candidate router now handles 406 using its existing authorized anonymous
exact-URL HTTP fallback, with the same identity, date, readability and body-size
checks as the existing 403 path. Without a usable fallback, 406 is recorded as
retryable `NETWORK / UPSTREAM_NOT_ACCEPTABLE`, retaining status 406 and the existing
five-attempt/backoff limit. It does not automatically escalate to browser/model
work. Authentication, policy refusal, rate-limit handling and missing-article
classification retain their previous behavior. No frontend, provider contract,
paid-operation identity, source approval or schedule changed.

Validation: Worker TypeScript passed; QA dry-run passed; 52 distinct acquisition
and article-integrity cases passed across the main run and one targeted rerun.
The first run loaded a test expecting three attempts; the existing limit is five.
The corrected test verifies all five attempts and terminal exhaustion. Coverage
includes successful 403/406 fallback, invalid fallback URL/listing/denial,
WWW-Authenticate refusal and no browser/model escalation.

Deployed to `distilled-news-sources-qa` version
`bae11f63-ebdb-4fe9-b1e9-3dac2bd9000d` at 15:40 UTC. The page and public API
smoke checks passed, built frontend matched, and variables/resource/secret bindings
were preserved. No migrations or private execution-service deployment were needed.
The separate pending QA assessment configuration edit was not included in this
commit or used to overwrite live configuration.

After deployment, 16 jobs matching this feed's old terminal HTTP-406/UNSUPPORTED
classification and having no retained acquisition result were requeued under
their original identities. Their exact previous JSON was saved locally before
conditional replacement. This is one bounded operator recovery, not a new
automatic attempt reset. Existing paid ledgers and completed evidence were not
modified. Initial readback confirmed four succeeded and twelve were still
pending/running; recovery continues through the ordinary queues. Other errors
and scheduling/freshness eligibility remain independent of this fix.

Local diagnostic/recovery snapshots are ignored files under `.local-reports/`;
they are not application code or committed credentials.

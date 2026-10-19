# Google News alternative collector: Joud review

Prepared 2026-10-19. Review only: no paid run, secret upload, budget grant,
production provider switch, or recurring collection is authorized by this document.

## Confirmed failure

A temporary Cloudflare remote preview, without production bindings, fetched the
same Google News RSS query using the application's current Accept header,
RSS-specific headers, and an identifying DistilledNews user agent. All returned
HTTP 503 with Google's message that the network may be sending automated queries.
The same preview fetched HortiDaily's advertised RSS URL successfully. This is
an upstream automation block on the Google request path, rather than a broken XML
parser. A different query or immediate retry is not a demonstrated fix.

## Proposed bounded trial

- Target application: `distilled-news-joud`, config `apps/worker/wrangler.joud.jsonc`.
- Provider: existing `google_apify` adapter, Actor `groupoject/google-news-scraper`.
- One query, Australian English results, at most 10 articles over the past 30 days.
- Proposed trial authorization: **one run, maximum $0.10**, not a recurring allowance.
- Actor timeout: 120 seconds. A client timeout must be reconciled against the run
  record before retrying; never blindly submit another billable run.
- Trial input: [google-news-trial.input.json](google-news-trial.input.json).
- Reviewed start endpoint:
  `POST https://api.apify.com/v2/actors/groupoject~google-news-scraper/runs?maxTotalChargeUsd=0.10&timeout=120&waitForFinish=1`.
- Authenticate using a server-side `APIFY_API_TOKEN`, never a browser token or URL
  query parameter. Joud's deployed secret-name list currently has no Apify token.
- Starting the Actor is billable work. No request to this endpoint has been made.
- A token is present in the ignored local `.env`; its validity and account balance
  have not been tested. No secret value was printed or deployed.

Prepared operator script: `scripts/probe-google-news-apify.mjs`. Running it without
flags prints the trial request without reading credentials or making requests.
After explicit approval, `node scripts/probe-google-news-apify.mjs --run --approve-usd=0.10`
starts at most one run and persists its identity in an ignored journal. Use
`node scripts/probe-google-news-apify.mjs --inspect` to inspect that same run and
save up to ten result rows. An existing or uncertain start journal blocks another
start; reconcile it rather than deleting it and retrying.

The Actor's current Store page advertises pricing from $0.80 per 1,000 articles.
This is not a total-cost guarantee: use the run cap, inspect the actual charge,
and review pricing again before enabling it. The Actor also fetches Google RSS;
its success from Apify's network must be demonstrated, not assumed.

Sources: [Actor documentation and pricing](https://apify.com/groupoject/google-news-scraper),
[Apify run API](https://docs.apify.com/api/v2/actors-runs-post).

## Required before production activation

1. Obtain the Apify token through the deployment's secret workflow and approve the
   bounded trial above. Do not change Joud's zero provider budgets yet.
2. Start the trial through a durable, uniquely identified paid-operation record,
   save its run ID before polling, fetch its dataset after success, and reconcile
   uncertain submissions. Verify that the returned stories actually match the
   requested topic; a successful or empty Actor response is not source approval.
3. Integrate onboarding verification with that verified dataset. The current
   assessment path fetches Google RSS directly and deliberately triggers no paid
   collection. **Adding a token or enabling the existing fallback alone does not
   fix source approval.** The verification job needs durable account/feed/source
   scope and the same paid-operation safeguards as the collector.
4. Preserve original publisher identity and canonical Google source identity;
   carry bounded observations through the existing contract/intake pipeline.
   Listing headlines are not full publisher articles. Validate window fields and
   output mappings against the current Actor schema before recurring use.
5. Only after a successful trial, separately review a recurring aggregate limit,
   per-operation reservation, per-source cap, and poll frequency. Production
   config and persisted budget grants must agree. The existing authorization
   script targets **sources QA**, not Joud; do not run it against Joud unchanged.

## Acceptance and rollback

Verify an actual accepted onboarding source plus subsequent ingestion, relevance,
budget exhaustion, continuation without duplicate runs, failure/timeout handling,
and accurate health reporting. If the trial is blocked or irrelevant, stop and
report that result. Do not declare the collector operational based on mock tests.
Revoking future budgets must preserve incurred reservations and uncertain-run
records; do not delete the ledger or recreate the allowance on deployment.

RSS discovery improvements can deploy independently. Paid collection remains off
until the trial and subsequent production authorization are explicitly approved.

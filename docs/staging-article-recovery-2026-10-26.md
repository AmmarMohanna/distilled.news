# Staging article acquisition recovery — 26 October 2026

Target: `distilled-news-staging`, feed `product-proof/news-about-ai` (`briefing_f79533f3-58ea-46d4-9c71-4873f6f5dc11`). This is staging, not production or Joud's deployment.

## Findings and fixes

- Tom's Hardware and Wired returned valid HTML exceeding the former 2 MB article limit. Article HTML now has a bounded 6 MB allowance; general feed/HTTP defaults remain 2 MB. Scripts/styles are omitted from DOM construction, structured metadata is retained, and excessive DOM complexity fails explicitly rather than silently truncating text. Retained article-body limits remain separate.
- Publisher challenges and recoverable extraction/size failures can reach the existing anonymous HTTP → Playwright → durable Zyte chain. Authentication, explicit policy refusals, rate limits, approval revocation and uncertain paid outcomes retain their protections. The existing bounded HTTP 406 recovery remains intact.
- Nature's public article redirects to its public cookie/identity service. The Worker still does not follow cross-origin redirects; a distinct diagnostic allows an exact-article provider to resolve the public request. Unsafe/private/credential-bearing redirects remain blocked. Historical policy failures require fresh, exact public redirect evidence before operator recovery; failure history and cumulative attempts survive.
- Exact trailing-slash normalization and Nature's same-article PDF canonical are accepted without substituting another article or changing stored candidate identity.
- TechSpot software RSS detail pages have a specific, schema-gated description/release-notes extractor. `dateModified` does not become an invented publication date.
- Nature's explicit subscription-content preview is marked access-restricted even when an `<article>` contains a readable abstract. HTTP 200 is not proof of full article access.
- Zyte's response envelope can be up to 10 MB for this article route because its HTML is base64 encoded. Other paid provider response defaults remain 4 MB. Zyte uses the durable request identity, scoped storage and existing reservation/unknown-outcome fences.

## Live Zyte samples

Six real failed candidate URLs were requested through the staging durable provider ledger. All six returned provider HTTP 200 and target HTTP 200. Reservations totalled at most $0.30 (six $0.05 ceilings); these are conservative reservations, not measured invoices. Full response bodies and extracted text are private under `.local-reports/staging-ai-audit-20261026/` and staging R2, never in this report.

| Publisher | HTML bytes | Extracted characters | Inspection |
| --- | ---: | ---: | --- |
| MarkTechPost | 630,429 | 7,101 | Readable article |
| OpenAI | 591,170 | 26,872 | Readable article; trailing-slash normalization |
| Tom's Hardware | 2,099,379 | 10,575 | Readable article, previously rejected for size |
| Wired | 2,327,704 | 19,213 | Readable article, previously rejected for size |
| TechSpot | 235,591 | 50,814 | Software description and release notes |
| Nature | 289,494 | 7,938 | Abstract/metadata/subscription preview; full paper unavailable anonymously |

The Nature sample must not be counted as full-article acquisition success. Provider transport success alone is insufficient. A subscription/licensed source is needed to obtain restricted full text legitimately.

## Preserving concurrent staging changes

The original staging version was `d3123391-158b-4c7b-9a95-4f29cc25e7ee`. Before upload, a deployment guard detected newer version `dff749db-6f0d-4dd7-94c7-0132451dbf13` (25 October 2026 23:34:51 UTC). The first upload stopped before mutation.

The final source artifact combines baseline `origin/ghada/v3-repair-context-staging` at `efb2073` with this branch's acquisition/recovery changes. Conflicts were resolved by feature: V3 frozen prompt versions 1/2/3 coexist with immutable unstarted-evidence recovery; the newer source discovery/assessment, Telegram, retention and frontend work is preserved. Staging's existing assets and resource/secret bindings are retained by the deployment upload.

A reproducibility patch, source manifest and bundle hash are retained privately as `acquisition-on-staging.patch`, `build-manifest.json` and `integrated/` in the audit directory. The active working branch remains `aya-performance-reliability-evaluation`; it alone is not the whole newer staging baseline. Future deployment must preserve the `efb2073` baseline plus the recorded repair patch.

## Validation

- Active-branch acquisition suite: 81 tests passed.
- Active-branch article fallback, public article HTTP, native execution and public-fetch checks passed (51 tests before the additional subscription-preview case).
- Combined staging artifact: 21 V3 window tests and 12 native-execution tests passed, including frozen prompt replay, immutable unstarted recovery and transaction serialization.
- Combined article/native final checks: 32 tests passed. Combined paid budget tests passed (14 tests), with article/native checks in the same run.
- Worker TypeScript checks passed both for the active branch and the combined staging artifact.
- Final artifact built successfully with Wrangler dry-run. No frontend rebuild or production replacement is involved.

Live queue recovery and final deployment details are recorded below after verification.

## Additional issue found during the live recovery

A competing acquisition could see another request still in flight for the same source and be marked `UNCERTAIN_PAID_SUBMISSION`, although that request subsequently completed normally. This was a classification/concurrency bug, not proof of a lost provider charge.

New paid claims atomically retain a unique dispatch owner and a finite active deadline. Competitors return backpressure while that claim is live, without taking another reservation or dispatching a duplicate. A recorded transport failure, missing/expired active metadata or genuine lost response remains uncertain; expiration never releases money or authorizes redispatch. Normal retained response completion permits explicit operator recovery of jobs that were incorrectly blocked. True lost-response operations remain protected.

Backpressure diagnostics now distinguish `ARTICLE_PROVIDER_IN_FLIGHT` from `HELPER_CAPACITY_WAIT`. Zyte responses that are fetched successfully but contain a catalogue or no usable article are classified as listing/extraction issues rather than preserving an earlier publisher-challenge label. Explicit target HTTP 403 is still reported as a publisher challenge.

The additional TechSpot URL `https://www.techspot.com/products/pc-games/call-of-duty-modern-warfare-4.330956/` returned Zyte and target HTTP 200, but is a catalogue/review listing. Its raw response is retained, and its article job is correctly `UNSUPPORTED / LISTING_PAGE` rather than falsely complete.

Final deployed staging version: `33368fdc-2943-45b4-a2b3-956430685c13`, deployed at `2026-10-26T00:10:11.616469Z`. Both follow-up uploads verified unchanged frontend HTML and no unintended binding mismatches. Zyte configuration is $15 provider/source allowance with a $0.05 operation ceiling. Existing reservations and unrelated provider settings were preserved.

The frozen recovery cohort contains 142 previously failed jobs. Its final outcome is recorded below; newly collected observations are reported separately. This distinction prevents an actively collecting feed from continually expanding the denominator.

## Final frozen-cohort result

Audited at `2026-10-26T00:16:42.274Z` (02:16 Beirut):

| Publisher | Completed with retained text | Confirmed exception | Pending |
| --- | ---: | --- | ---: |
| MarkTechPost | 10 | None | 0 |
| Nature | 36 | 5 subscription-restricted papers | 0 |
| OpenAI | 45 | None | 0 |
| TechSpot | 4 | 1 catalogue/listing URL | 0 |
| Tom's Hardware | 40 | None | 0 |
| Wired | 1 | None | 0 |
| Total | 136 | 6 | 0 |

All 136 completed cohort jobs have durable acquired-content results. Retained bodies range from 2,551 to 50,814 characters. The catalogue and restricted previews were not promoted as complete articles. Their original observations and raw provider responses remain retained.

There were zero genuine unknown/failed Zyte operations at the final audit. This feed had 78 retained provider HTTP 200 responses, with $3.90 in conservative operation reservations. This is not a claim that $3.90 was invoiced; provider billing was not reconciled to actual charges. Existing X operations and unrelated financial history were preserved.

The final provider-accounting regression file passed all 16 tests, including active waiting, single dispatch, reservation limits, expired claims, transport/body failures and completion reconciliation. Additional recovery checks passed for refusing true uncertainty and queuing behind active requests. The final article fallback file passed 21 tests. TypeScript and whitespace checks passed.

Private evidence: `final-durable.sql`, `final-durable-result.json`, `sample-state-first.json`, `zyte-samples-results.json`, `techspot-product/`, recovery dispatch receipts, deployment responses, settings snapshots, `acquisition-on-staging.patch` and `build-manifest.json` under `.local-reports/staging-ai-audit-20261026/`. Full publisher text is intentionally excluded from this tracked report.

These results validate acquisition and durable retention for the tested cohort. They do not establish universal publisher access, article completeness, briefing factual accuracy or production readiness. Newly arriving content is outside this frozen denominator.

## Final public-reader check

The public feed API returned HTTP 200. Across the live feed (including arrivals beyond the frozen cohort), OpenAI had 60 completed/0 failed acquisitions, Tom's Hardware 50/0, Wired 50/0 and MarkTechPost 10/0. Nature had 48 completed and 12 access-restricted papers; TechSpot had 29 completed and the one catalogue rejection. All source acquisition pending counts were zero at that read.

The reader reported 407 completed acquisitions out of 420, with the 13 confirmed access/representation exceptions above. There were 39 pending intelligence reviews and no published edition yet, so this audit does not claim that this feed's first briefing has completed publication. Collection and review continue under the existing schedule and spending authorization.

## User-directed removal of source budget enforcement — 26 October 2026

The user subsequently requested no application source-collection budget limits. The incident was the deployment-wide cumulative reservation cap, not demonstrated exhaustion of the external provider account: TwitterAPI.io had reserved $15, X/LinkedIn Apify about $14.75, and Zyte $14.95. Conservative per-operation reservations accumulate across feeds.

Staging now uses `SOURCE_COLLECTION_BUDGET_MODE=unlimited`. The durable provider transport bypasses global/provider, per-source and daily aggregate admission checks in this mode. Reservations, counters, immutable paid identities, active-request waiting and genuine unknown-outcome fences are retained. Existing numeric budget records are not deleted, refunded, reset or increased. Per-request accounting estimates and enabled-provider configuration remain distinct from aggregate collection quotas. Other deployments retain their explicit/default mode; this rollout targets staging.

Reader availability uses the same mode and does not report an old app budget block as current exhaustion. Backend collection and article fallback both receive the unlimited setting.

Deployed staging version: `cb761fde-4d1e-4228-bfe3-1e4b0192fefa`. Assets/frontend and unrelated bindings were checked unchanged. Live counters subsequently reached TwitterAPI.io $15.02 and Zyte $15.25, proving dispatch continued beyond the former $15 cap without resetting accounting. These totals are reservations, not invoices.

Validation: both new unlimited-mode accounting tests passed, all nine source-availability tests passed, and five selected accounting/regression tests passed together (including capped-mode compatibility and unknown-outcome protection). TypeScript checks passed. Reader/financial evidence is saved privately as `unlimited-reader-proof.json`, `unlimited-financial-proof.json`, and `deploy-unlimited-result.json`.

## Subsequent catalogue support

The user later authorized product/catalogue support. The previously rejected TechSpot product page now completes as `LISTING_RESULT / UNKNOWN` with `PRODUCT_DETAIL` acquired provenance and 6,184 retained characters. The original failure/benchmark outcome above remains historical evidence; it is no longer an outstanding acquisition failure. See `docs/catalogue-product-acquisition-2026-10-26.md` for implementation and live recovery validation. Unlimited source collection remains enabled.

# Remaining Pandemic acquisition failures: QA recovery

The frozen set contained 24 non-authentication acquisition jobs on the Pandemic
feed. At 2026-10-28T01:38:23Z, 23 were DONE and one remained FAILED. These are job
counts, including distinct Google News and direct publisher observations of the
same articles; they are not 23 unique stories. The seven original authentication
cases and ProMED authentication failures were outside this set.

Confirmed failed HTTP responses can now use a bounded Zyte browser representation
under a separate durable operation identity. Unknown provider outcomes retain
their retry fences. Authentication, policy and rate-limit failures do not trigger
this fallback. Original observations, acquisition records and payment history
remain retained. Same-paper fulltext-to-abstract redirects retain only the public
abstract as ARTICLE_EXCERPT/PARTIAL. Known publisher attribution redirects remain
source-bound.

Recovered evidence includes PNAS, ASM, NEJM, Toronto, NYT and IDSE articles,
source-bound GAO/Frontiers resource descriptions, and a Lancet public abstract.
Resource descriptions are LISTING_RESULT/UNKNOWN, not invented full articles or
video transcripts. FULL_ARTICLE does not establish extraction completeness;
completeness remains UNKNOWN where it cannot be established.

Two CBS observations initially included unrelated video recommendations. The
parser now uses the exact-page VideoObject description. An audited, hash-verified
re-extraction created a new 119-character LISTING_RESULT/UNKNOWN current revision
and queued reassessment. Original immutable artifacts and prior revisions remain.
The current revision is
`reextraction-4962c3ef0a673346b4d10ee2df6d3ac6829c1f2c861408459489f37aee14fe8c`.
Historical published output was not rewritten. Raw job inspection therefore still
shows the older CBS acquired artifacts; that is not the current canonical body.

The remaining Business Journals OHSU page provides a subscription preview without
enough usable article text. Its final job diagnostic is still
EXTRACTION_FAILED / ZYTE_RENDERED_TEXT_UNAVAILABLE. This is not a successful full
article fetch and must not be reported as one. Login/paywall access is unresolved.

The Google-resolved NEJM retry used reviewed, hash-verified stored provider
evidence tying the exact job to the exact publisher target. The generic recovery
API was not weakened to accept arbitrary Google-to-publisher mappings.

QA code: `01d13a2`; active version
`87d62dc7-493e-422b-a960-83a62adbbde7`. Only sources-QA was updated; staging and
production were not changed. Private snapshots, response bodies, recovery grants
and audit scripts are retained in ignored `.local-reports/aya-ghada-qa-deploy/`.

Validation before integration: connector suite 310 passed, followed by focused
resource/discovery checks including two added cases (312 unique connector cases);
48 focused Worker fallback/identity/resource checks and three operator-recovery
checks passed. Worker TypeScript and QA dry-run build passed. These checks do not
prove universal publisher accessibility or briefing factual accuracy.

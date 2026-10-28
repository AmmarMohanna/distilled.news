# Publisher acquisition diagnosis and bounded fixes

Target: Joud Worker, existing dedicated database/resources. No migration or
shared-contract change is required. Raw publisher HTML and job metadata are
private under `.local-reports/aawsat/`; this report contains no article bodies.

## Recorded failures

Read-only inspection of the reported feed found these causes:

| Source | Recorded cause | Remediation |
| --- | --- | --- |
| english.aawsat.com | `UNSUPPORTED / LISTING_PAGE` on an opinion index and real opinion articles | Recognize `OpinionNewsArticle` and equivalent explicit article schema types. Bind numeric CMS IDs using an exact canonical URL plus matching headline. Read the explicit Drupal article-body container. |
| arabnews.com | `EXTRACTION_FAILED` | Recognize its explicit `article-body` container, retaining the full extracted text. |
| naharnet.com | `EXTRACTION_FAILED`; some `UNCERTAIN_PAID_SUBMISSION / ARTICLE_PROVIDER_OUTCOME_UNCERTAIN` | Read description text only when directly owned by an explicit schema Article container. Preserve unknown paid outcomes and their retry fences. |
| aljazeera.com | `INVALID_RESULT / FALLBACK_CANONICAL_MISMATCH` on video URLs with `traffic_source=rss` | Accept only tracking-equivalent canonicals while retaining the originally admitted candidate identity. This does not create a transcript or guarantee sufficient video-page text. |
| jpost.com | `UNSUPPORTED / LISTING_PAGE` on `/latest-articles` | Treat the known index as discovery and exclude it from individual article candidates. |
| cbsnews.com | `EXTRACTION_FAILED` on `/live/` | Treat the live index as discovery, not a full individual news article. Do not manufacture stream/transcript evidence. |

Known section/author/index URLs remain discovery surfaces even with misleading
article metadata. Discovery continues to retain actual observed same-origin
article links. Foreign URLs, different paths and content-bearing query changes
remain rejected. Nested body wrappers count as one container; independent sibling
bodies remain ambiguous and are not concatenated into evidence.

Original publication dates remain independent of update/acquisition dates. In
particular the retained Asharq Al-Awsat example is from September 2025; fixing its
extraction must not make it fresh October 2026 news. No old candidate IDs,
observation identities, failed-job records, provider receipts or source accounts
are rewritten by these fixes.

## Validation and reproduction

```powershell
corepack pnpm --filter @distilled/connectors test
corepack pnpm --filter @distilled/worker exec vitest run src/v1-intake/acquisition.test.ts src/v1-intake/article-integrity.test.ts src/v1-intake/article-fallback.test.ts
corepack pnpm --filter @distilled/connectors typecheck
corepack pnpm --filter @distilled/worker typecheck
```

An optional offline regression reads privately retained publisher responses:

```powershell
$env:DISTILLED_PUBLISHER_HTML = (Resolve-Path .local-reports/aawsat).Path
corepack pnpm --filter @distilled/connectors exec vitest run test/publisher-article.test.ts
```

The replay checks actual Asharq Al-Awsat, Arab News and Naharnet body extraction,
and author/Jerusalem Post/CBS index handling. Normal CI runs synthetic structural
fixtures; the private replay is skipped unless its directory is explicitly set.
No paid providers, new collection jobs, live model calls or job resets are used
by these checks.

## Recovery limits

Deployment fixes future routing/extraction; it does not automatically reopen
terminal failed jobs. The reader warning currently counts retained failed jobs,
so historical counts can remain after a code fix. Do not delete them or mark them
successful without acquired evidence. Correctly rejected index/video candidates
must not become fabricated articles just to remove a warning.

Existing unknown paid submissions need provider-specific reconciliation before
any retry. This change deliberately does not clear those reservations, rotate
operation identities or buy another provider run. No claim is made that every
reported source has completed a new end-to-end live acquisition after deployment.

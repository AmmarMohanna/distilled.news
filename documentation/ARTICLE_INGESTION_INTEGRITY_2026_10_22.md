# Article dates and extraction integrity — October 22, 2026

Scope: source collection and acquisition, before downstream briefing intelligence.
No V3 editorial or architectural changes are introduced.

## Findings and changes

The Python extraction helper previously exposed the extractor's generic `date`
as `publishedAt`. It did not identify whether the date represented original
publication, an update, or a heuristic extraction. Website collection also
forwarded this value without checking the original page metadata.

Collection and acquisition now read explicit original-publication metadata:
HTML publication fields and same-article Article/NewsArticle JSON-LD. Update
dates are separate. Dates on related articles, WebPage objects, collection
timestamps, URL paths and occurrence dates mentioned in prose cannot establish
original publication. Conflicting explicit original dates remain unresolved;
a fresh feed hint cannot silently resolve that conflict. Existing same-day
timestamp precision handling remains available.

Acquisition provenance retains the article publication/update values, original
date candidates and their fields, connector hint, and generic extracted date.
`observedAt` and `acquiredAt` remain separate collection/acquisition timestamps.
Older private helpers without explicit publication metadata can still supply
readable content, but their unclassified date is retained only as a diagnostic.
An available connector publication hint remains labeled as a hint.

The acquisition router also previously assigned `FULL_ARTICLE / COMPLETE` and
`extractionComplete: true` to every successful extraction. It now rejects
detectable encoded/corrupted bodies, including a readable opening followed by
a substantial encoded tail. The check applies to supplied full articles,
direct HTML, private extraction, and final acquisition results; website
collection applies it before handing off its extracted body. Failed
acquisition retains a typed extraction diagnostic and creates no evidence
revision. It does not invoke another model to clean up the source text.

Generic helper extraction retains `contentCompleteness: UNKNOWN` and
`extractionComplete: false`; successful text retrieval alone is not proof of
complete recovery. Recognized full containers and the existing independently
verified browser path retain their prior completeness authority, subject to
the new negative text-integrity check. Passing this check does not establish
semantic readability, detect every form of obfuscation, or prove completeness.

## Verification

- Connector integrity, provider runtime and WordPress regressions: 121 passed.
- Worker acquisition, date and D1 persistence regressions: 48 passed.
- Python helper regressions: 29 passed.
- Connector and Worker TypeScript checks passed.
- Frontend build and QA Worker dry-run bundle passed.
- `git diff --check` passed.

The regressions cover the reported August 31 versus October 21 date pattern,
modified-only/heuristic dates, conflicting original metadata, related-article
dates, persistence of date provenance, encoded tails, failure diagnostics,
supplied COMPLETE claims, legacy helper compatibility, and Arabic/French/
Japanese prose. Python's redirect test fixture now supplies an empty response
stream so it closes correctly under the local Python 3.10 runtime.

The two exact publisher URLs and original saved source snapshots were not
available in this checkout. These are engineering regression results, not a
claim that those particular articles were reacquired or independently checked.
No full Worker-suite or live editorial-quality result is claimed.

## Deployment and retained data

Target: `https://distilled-news-sources-qa.distillednews-platform.workers.dev`.
The release requires no D1 migration, financial grant change or new model call.
Preflight must preserve current QA variables, secret bindings, database, R2
bucket, queue bindings and private execution binding. Deployment evidence belongs
under the ignored `.local-reports/ingestion-integrity-20261022/` directory.

The Python helper is a separate VPS service: a Worker deployment does not update
`scripts/source-execution.py` on that server. The Worker is compatible with the
older helper and treats its unclassified dates conservatively. Do not describe
the helper patch as deployed without separate deployment evidence.

Existing immutable acquired records and published editions are not rewritten.
Repair of a specific retained article requires identifying its source and
issuing an ordinary scoped recheck/new observation; never reset paid work or
overwrite evidence in place to make historical records appear corrected.

## Confirmed QA rollout

Deployed on October 22 at 14:43 Beirut, Worker version
`027c0e5f-7c07-4562-a7e9-ab6e830e6b5d`, serving 100% of sources-QA traffic.
The previous version is `ae079788-ca55-4ce6-a97b-3053b0abda85`.

The live QA configuration contained additional V3-related variables absent from
the checked-in dataset configuration. The generated deployment configuration
preserved every live variable, including those values, rather than replacing
them with the older file. Preflight also compared the deployed bundle before
upload; it had no V3 engine implementation markers. No V3 implementation or
runtime switch was added or removed by this release.

Post-deployment verification at 14:44 Beirut confirmed the new active version,
identical variable/resource/secret-binding metadata, HTTP 200 for the homepage,
and exact frontend HTML matching the local build. Anonymous
`/api/auth/session` and `/api/explore/feeds` both returned HTTP 200 JSON.
No application data, financial grants, source configuration or feed pause state
was manually changed. No paid provider or inference evaluation was started.

The Python VPS patch remains local; this rollout updates the QA Worker only.
The before/after settings and deployment metadata and the final verification
receipt are saved in the ignored deployment-evidence directory above.

# Readable content admission — October 27, 2026

Implementation: `2ac291e` on `aya-ghada-integration`, deployed to sources-QA.

Two real acquired publisher URLs were incorrectly rejected as listing pages: CIDRAP's GAO/HHS article and ASTHO's infectious-disease follow-up resource. Their HTTP 200 pages contain readable primary prose. Private captured-page checks now extract 4,499 and 2,715 characters respectively. Full captured pages stay outside Git.

Acquisition now detects a single readable primary content scope before treating related links or URL patterns as an index. It supports article-body/entry-content/Drupal/rich-text containers without mandatory metadata, generic main/body prose with or without headings/paragraph tags, and source-owned text/plain, Markdown and article-text JSON responses. HTML-like responses mislabeled text/plain are parsed as HTML, preserving original date metadata. JSON identity fields must still match the requested document. No model is used to reconstruct unreadable source text.

The URL path alone no longer rejects `/topic/resource/...` articles. An actual headline-only index remains discovery rather than evidence; no readable primary text becomes an extraction diagnostic, not unsupported-layout rejection. Explicit authentication, policy, original/canonical identity, corruption, size and source-authorization guards remain. Heuristic/text-document evidence has UNKNOWN completeness rather than asserting the entire article was acquired. This change is not a PDF/OCR, office-document or authenticated-session implementation, and does not promise content that the server did not supply.

Validation: full connector suite 299 passed; final primary/discovery/date connector regressions 87 passed after the last helper change. Final Worker checks: 43 format/fallback/date/redirect tests plus 17 persisted article-integrity/catalogue tests passed. Worker and connector TypeScript and QA dry-run passed. Tests include headline indexes, related links, mismatched JSON identities, login denial, encoded bodies and conflicting publication dates.

Seventeen eligible Google News acquisition jobs were reopened under `qa-readable-formats-recovery-20261027` using the existing one-extra-attempt recovery API. One non-eligible failure was refused. Queue dispatch preserved original identities, prior failures and paid operation keys. Live verification completed both concrete examples: CIDRAP retained 4,499 characters and ASTHO retained 2,715 characters, each with UNKNOWN completeness. Six recovered jobs were DONE, five were waiting for source/helper capacity and six reported extraction failures (two without primary article text and four without usable Zyte article text). Some pages still returned no usable primary text or an unusable provider response, which is not recorded as successful acquisition. Recovery is not proof that every publisher is accessible.

Private logs and operational receipts: `.local-reports/aya-ghada-qa-deploy/formats-*`.

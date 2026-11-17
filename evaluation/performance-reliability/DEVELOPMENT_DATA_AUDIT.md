# Existing development data: verified limits

Audit date: October 24, 2026. Read-only audit of the private frozen pilot and extended exports; original datasets were not edited. This is a data-integrity/leakage audit, not a new live run, human annotation or quality result.

| Measure | Pilot | Extended |
| --- | ---: | ---: |
| Windows | 20 | 95 |
| Tracks | 8 | 20 |
| Feeds | 5 | 13 |
| Distinct acquired IDs | 240 | 565 |
| Article occurrences | 400 | 817 |
| Empty retained-input windows | 1 | 12 |
| English windows | 9 | 75 |
| Arabic windows | 8 | 14 |
| French windows | 3 | 6 |
| Missing initial-history tracks | 3 | 12 |
| Exact URL groups shared across feeds | 0 | 8 |
| Exact text-hash groups shared across feeds | 0 | 8 |

All **240 pilot acquired IDs occur in the extension**, with consistent content/metadata fingerprints. Both sets have already been used for development. They cannot be treated as independent development versus held-out evaluation sets.

The eight URL-group and eight text-group counts are separate mechanical checks, not sixteen independently reviewed developments. Splitting by feed alone would not prevent all exact-content leakage. Cross-publisher stories and translations may leak even without matching URL/text hashes; a development-identity review is still needed.

The 46-window World News track dominates the extended set's English coverage. Counts of windows or repeated model trials are not counts of independent stories. French has only six windows in two short feed sequences: this does not support broad French reliability/quality conclusions or a language-balanced pooled score.

The extended cases contain 443 COMPLETE and 374 UNKNOWN completeness **occurrences**, including overlapping experiments. These flags describe stored extraction metadata, not independently established full-publisher recall or factual accuracy. The 89 unassigned acquisitions remain outside availability windows until trustworthy availability can be established; use the original private artifacts rather than guessing dates.

The auditor checked every case file hash, article text hash, repeated acquired-ID fingerprint, half-open interval membership and declared track adjacency. It did not verify human labels, semantic story identity, source truth, source recall or independent partition eligibility.

Pilot manifest SHA-256: `c02ccab1ad2c452311a4fde885e4cce8bfb85d587c93a611b3030aad90536d19`.

Extended manifest SHA-256: `cfc2eeeec41fc482883df4ae87017d0a4466850aad2a43ad70c8c6c4bee2ef53`.

The aggregate local report is `.local-reports/evaluation-corpus-audit-20261024.json`. Full text stays in the existing private directories. Reproduce the mechanical audit from the repository root:

```powershell
node evaluation/performance-reliability/audit-corpus.mjs .local-reports/v3-frozen-acquisition-20261023/dataset/manifest.json .local-reports/v3-extended-acquisition-20261023/dataset/manifest.json
```

Use these sets to develop and debug the runner. Collect/freeze independent later sequences and agree on semantic group assignments with the quality owner before qualifying validation or held-out results. Never relabel this already-reviewed development data as unseen because a new branch/model is being tested.

# Blocked construction schema enum replay

Offline only; no application behavior changes, remote mutations, provider calls or inference charges.

Four frozen resource waits from the Ai again staging feed were replayed: initial construction and reconciliation for each of two articles. Original serialized schema bytes were not retained. The deployed unchanged construction builder reconstructed schema shape using saved mentions, spans, source text, candidate catalog and authoritative background eligibility. All four reproduce the exact recorded enum counts, string-character totals, property counts, nesting depth and ENUM_COUNT-only failure. This is not a byte-for-byte comparison against an unavailable original wire payload.

| Article / both stages | Enum occurrences | Distinct scalar values | Repeated scalar occurrences | Identical-list duplication | After sharing identical lists |
| --- | ---: | ---: | ---: | ---: | ---: |
| Laplace robots / 48 mentions | 2,452 | 120 | 2,332 | 2,284 | 168 |
| Replit / 32 mentions | 1,197 | 93 | 1,104 | 1,071 | 126 |

Distinct scalar values means unique typed JSON values across all enum definitions, not unique semantic identities. Equal strings in different fields can have different roles. The correct safe deduplication unit is the complete enum schema/list, not globally replacing all choices by one superset. After identical-list sharing, overlapping but different choice sets remain separately constrained. No allowed destination is added or removed.

Laplace's 49-choice destination list repeats 29 times (1,421 occurrences); its 48-choice group list repeats 20 times (960). Replit's 32-choice group list repeats 19 times (608); its 33-choice background-eligible list repeats 16 times (528). The remaining counts include existing enum definitions. Thus the excess is predominantly repeated destination lists, not thousands of distinct facts/events.

Root cause: scopedConstructionWireSchema already shares enum definitions, but constructionTransport subsequently injects groupId and per-ClaimMention disposition choices inline. Those later additions are not shared again. Initial/reconciliation shapes are identical for the same offered unit/candidate sets.

Counterfactual offline application of existing shareSchemaEnums to the completed schema reduces counts to 168 and 126; both pass inspectProviderSchema with zero violations, unchanged property counts and depth. Application ownership/coverage validation was not bypassed or changed. This demonstrates schema admission, not live provider acceptance or semantic quality. No production patch or deployment is included in this investigation.

Reproduce from repo root: `corepack pnpm exec vitest run --config benchmarks/blocked-schema-enum-replay.vitest.config.ts`. Requires the frozen ignored `.local-reports/single-feed-preflight/ai-again-pipeline-details.json`; test intentionally fails if evidence is unavailable. Results: `benchmarks/blocked-schema-enum-replay.json`; generated full schemas remain local under `.local-reports/enum-schema-<operationId>.json`. One test executes assertions for all four blocked operations.

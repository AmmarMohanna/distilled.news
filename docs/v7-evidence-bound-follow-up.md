# V7 evidence-bound verification follow-up

## Status

V4 stays deployed; measured V7 stays opt-in and unchanged by default. Two independently selectable experimental options are implemented within version 7, not a new complete prompt version:

- `v7Experiment: 'qualifications'`: adds one compact source-clause check to the existing editor, consolidator and repair prompts. Verifier prompt and input stay unchanged.
- `v7Experiment: 'item-local-evidence'`: changes only verifier evidence presentation. Editor/consolidator/repair and the verifier system stay unchanged.

They are deliberately mutually exclusive for the first independent comparisons. No combined candidate is justified yet. No routine calls, claim extraction, provider routing, storage, accounting or publication behavior is added. No deployment or promotion is authorized.

## Exact-response diagnosis

Saved evidence: `v7-results-2026-11-03.json`, `v7-findings-2026-11-03.json`, original frozen corpus and previous quantity/commitment responses.

1. **Arabic fund:** the editor returned a definite initial 5% allocation but omitted stockholder approval from both headline and body. The primary article explicitly says “Subject to stockholder approval, 5% of Anthropic’s shares will be committed today”. The original full passage was present in editor and verifier requests. The verifier returned `ok`. There was no repair call. This is writer qualification loss plus verifier false acceptance, not absent evidence or parser loss.
2. **Arabic METR:** the editor wrote “ولا يمكن لـ Anthropic منع النشر إلا في حالات محددة” (publication prevention with exceptions), while the source says “Anthropic can’t veto publication, but we can require them to redact information”. Redaction authority does not confer an exception to a publication veto. Again the full passage reached both stages and the verifier returned `ok`; no repair introduced it.
3. **Quantity/timing controls:** retained fixed-to-up-to and future-to-completed statements passed V7 verification. The previous narrow instruction also failed. The input contains correct source evidence, but correct IDs and an `ok` verdict do not establish semantic comparison.
4. **False positives:** the earlier baseline requested optional percentages, repeated body content and preferred synonyms. The V7 verifier reduced those errors but wrongly rejected a source-supported synthetic completed transfer because the source was fictional/unrelated to another item. That is semantic context contamination; all returned indices were valid. No code indexing defect is demonstrated.

These findings describe observed stages, not a proven account of the model's internal reasoning. Hypothesis to test: bringing each item beside its own full evidence reduces cross-item contamination and helps clause comparison. A second hypothesis is that a compact pre-return writing check preserves qualifications across translation. Neither is established by offline tests.

## Minimal implementation

The writing check asks the model to compare quantities, status and rights with their supporting clause, preserve conditions in the requested language and headline, and omit optional detail rather than a necessary qualification. It is general, with no company-specific rules or source keyword classifier. It adds **527 UTF-8 bytes** to an affected writing system prompt; it does not ask for extra output or a longer article. The unchanged measured V7 systems remain available exactly.

The verifier layout serializes evidence packets as JSON:

- Original numbered headline/body, citation refs, relation, prior-item text and fallible automated hints.
- Only those refs' full original prepared title/text/source/publication metadata.
- Identical reference sets share one packet to avoid repeating the same long article unnecessarily.
- Source refs and local item numbers remain unchanged; the engine's existing local-to-global result mapping remains authoritative.
- Reader history stays global, preserving union-of-prior-publications novelty checks. Previous repair reviews retain their original local indices and fallible status.

There is no AI extraction, summary, selected passage truncation or regenerated evidence. JSON quoting preserves source text and makes boundaries explicit; it does not guarantee semantic compliance. Missing referenced evidence throws rather than being fabricated or dropped. The existing fail-safe parser, verification/repair behavior and native provider admission remain intact.

A source referenced in different citation combinations can still repeat across packets. Size must be measured before each experiment; the current cases do not qualify every large workload or establish a universal 10% bound. Do not enable this by default from these input-size checks.

## Offline controls and overhead

The new controls retain exact Arabic fund/METR failed items, source-linked concise corrected examples, English controls and the prior quantity/timing set. Expected judgments are provisional AI-assisted engineering labels, never human gold. The English fund headline remains ambiguous and is excluded from forced scoring; absence of optional board detail is not automatically a factual error.

Requests are prepared in `benchmarks/v7-evidence.prepare.test.ts`, with private exact requests under `.local-reports/v7-evidence-followup/requests.json`. Replaying the real engine with the saved editor response confirms the shared-layout verifier request is byte-for-byte equal to its retained request. Candidate requests preserve real numeric hints rather than replacing them with empty hints. No provider is called in this replay.

The production-shaped English/Arabic layout variants add **355 / 377 serialized bytes**, approximately **1.75% / 1.95%**. Controlled mixed batches add approximately 21% / 16%, because citation combinations overlap; those artificial stress controls do not represent per-briefing production overhead. Input bytes are not measured input tokens, output usage, latency or full-pipeline cost.

The first proposed real comparison is eight mini-verifier calls: shared versus item-local layout for English/Arabic controlled batches and English/Arabic retained real drafts. It holds model, system, claims, history, evidence, token caps, temperature and retry policy fixed. No editor, repair, paid judge, publication or notifications. Fresh public catalogue prices remain mini $0.40/$1.60 per million input/output tokens. Conservative UTF-8 planning bound: **$0.1161**, proposed authorization cap **$0.15**. Native admission and fresh provider headroom must pass before every request. Approval is requested separately; no previous paid scope is reusable.

Evaluate each non-ok verdict against the intended error, quoted offending text, exact cited evidence and proposed minimal correction. A rejection for “fictional source” or an unrelated topic is not detection of a quantity error. Preserve unresolved rationales and false rejections separately. Exact quote validation checks provenance, not semantic truth.

Only a layout winner should advance to independently testing the writer qualification check, followed by matched full-pipeline evaluation including repairs. Coverage, S13 separation, density, conditions and rights must remain correct. Require no material factual regression and aim for at most 10% added actual cost/latency. Do not claim that either candidate fixes model behavior before real measurements.

## Separate CI investigation

Commit `9c9a251` Project checks run `41666518689`, job `126023185863`, failed **before browser tests**, during `pnpm exec playwright install --with-deps chromium`. Runner was `ubuntu-26.04` (image `20261101.64`). Apt could not locate `fonts-unifont`, `xfonts-cyrillic`, `xfonts-scalable`, `fonts-ipafont-gothic`, `fonts-wqy-zenhei`, `fonts-tlwg-loma-otf`, and `fonts-freefont-ttf` had no candidate. This is a runner/package-install failure, not an application assertion failure.

Fix `b10e138` pins only jobs that install Chromium to `ubuntu-24.04`; all install commands and browser tests remain. In run `41671247609`, Chromium dependency installation has **passed** in `verify` and `Browser checks`, and browser correctness fixtures have passed. Overall workspace/E2E completion is tracked separately; install success is not a claim that every later check passed. Original private job logs are retained locally; no credentials are committed.

## Validation record

- No paid calls or new financial records in this follow-up so far; the new eight-call layout authorization request is pending.
- Native pure admission estimates for the frozen eight requests sum to **$0.1060136**; this is a reservation estimate, not charges. The higher $0.1161 planning bound and proposed $0.15 cap leave framing headroom. Fresh authorization, accounting and provider preflight are still required.
- Exact source/case fixture checks preserve the raw editor errors, all-ok verifier outputs, and absence of repairs. Concise corrected controls are labelled separately, and the unresolved English conditional headline is not forced into an error label.
- The full briefing suite passed **175 tests / 39 files**. Briefing and Worker TypeScript checks passed; offline request-preparation test passed. Structural tests do not demonstrate semantic improvement.
- Reproduce request preparation without network or paid inference: `node node_modules/vitest/vitest.mjs run --config benchmarks/v7-evidence.config.ts`.
- There are 22 mixed control cases across the two languages: six provisional errors, fourteen accurate controls, two unresolved cases. The separate retained real drafts test production-shaped multi-item evidence rather than relying only on synthetic batching.

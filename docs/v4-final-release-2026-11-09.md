# Final V4 integration — 9 November 2026

**Release-review follow-up:** the three blockers identified after this initial
report are now fixed and verified. See the [blocker closure report](v4-release-blocker-fixes-2026-11-09.md)
for current test counts, malformed-body Worker behavior and canonical render-time
error localization. It supersedes the initial UI error implementation below.

**Ready for integration as a V4 reliability release, not an editorial-quality
upgrade or deployment.** Branch: `integration/v4-finalized`. No paid inference,
new model, mandatory stage, production deployment or financial-state change.

## Base and audit

The local `main` reference is `37eb30e1` and predates the V4 package/integrated
frontend. The user's latest named branch, `ghada/v3-editorial-distillation` at
`cc450d21`, is the release base. `main` is its ancestor. The research reference
is `research/editorial-information-gain` at `02de7798`.

Using the working V4 branch avoids replaying the entire intervening product
integration as though it were part of this optimization patch. The dirty main
checkout and research checkout remain untouched. This is a local-ref audit,
not a claim that a remote branch or deployed environment was refreshed.

| Research commit | Release decision |
|---|---|
| `8b761994` | Selectively port relationship/selected-prior validation, strict verifier verdict/issues parsing, safe exact body/headline duplicate handling and accompanying regressions. |
| `4e5c1b34` | Selectively port strict repair index/ownership/text/completeness checks and frozen-clock test fixes. No AI-authored rewrites become generated production output. |
| `b03fa642` | Preserve the 18-case review pack and selected-history boundary analysis as offline acceptance evidence. |
| `a86b9e3b` | Exclude optional relationship repair/keepText: not qualified; default repair remains unchanged. |
| `421c7dc6`, `686e68fc`, `c55305b0` | Do not enable experimental exact-evidence preparation, source-linked/quiet memory, caller-eligibility or body-fact profiles. |
| Development/fact pipelines, two-pass prototype, atomic-editor amendment | Do not merge into release runtime. Failed/unqualified experiments remain on the intact research branch. |

These are selective ports, not cherry-picks of commits containing unrelated
research functionality. Existing pre-campaign optional prompt/architecture
paths remain disabled by default and retained for historical compatibility;
this release does not enable or expand them.

## Actual runtime changes

Only `packages/briefing/src/engine.ts` changes editorial execution:

- Current-format relations must be literal `new`, `update` or `correction`.
  Updates/corrections require an exact model-visible prior ID; new items cannot
  carry a prior link. Valid prior IDs are preserved byte-for-byte, including
  unusual whitespace, rather than normalized after admission.
- Consolidation cannot inherit an old update link after legitimately choosing
  `new`. It cannot silently erase a foreign link or manufacture a relationship.
- Verifier verdicts must be exact enum values. Invalid capitalization, whitespace,
  issue arrays or item ownership are not transformed into approvals.
- Repairs require literal integer, unique, in-range local indices and every
  requested item. Non-dropped items require valid headline/body fields. Only
  explicit `drop:true` is an intentional omission; malformed output is not.
- A body that is completely identical to its headline is emptied only after
  verification. There is no semantic shortening, paraphrase matching, body
  regeneration, qualifier removal or automatic source-fidelity rewriting.

Invalid responses use the existing single format-correction opportunity, then
fail safely. Legacy prompt 1–3 parsing is preserved. The editor, verifier and
conditional repair stages, bounds, independent rechecks and citations remain.

**Unchanged:** GPT-4.1 editing/repair and GPT-4.1 mini verification defaults;
V4 prompt version; model transport; prompt builders; source preparation; Worker
window, source eligibility, history selection, recovery and publication code;
configuration, schemas, bindings, source integration and Public/Private controls.
No new dependency or runtime profile is introduced.

## Eligibility, source preservation and reader history

Retain the base Worker's existing `newsWindowEligibility` handling for in-window
sources, accepted late discoveries and revisions/retries, and its published
reader history at the existing cutoff. Do not add the experimental caller-eligible
prompt contract or source-linked semantic retrieval. Those were not qualified
for this release's cost/recall target.

No new source-level suppression is added. Worker evidence retains full accepted
post text; its existing preparation avoids the Jaccard branch. Regression checks
confirm the Deir Mimas restriction, camp speaker/modality/geography and both
ambiguous fuel labels reach preparation unchanged except existing whitespace
normalization. The source-linked review pack retains original text.

**Existing limitation:** URL/containment folding can still lose differing text in
controlled cases. The experimental exact-evidence policy had no demonstrated
real-corpus recovery and was not qualified for production. It is not enabled
merely to imply the partial-post problem is solved. Likewise, the editor may
still discard an available new clause inside a repetitive post. This release
hardens integrity; it does not promise fact-level recall.

## Expected strict-link behavior

A true antecedent in the full archive but outside the selected history is not
valid model-visible evidence. An attempted link to it now triggers bounded format
correction and ultimately rejection if repeated, rather than silently losing the
link. The release does not expand history, guess an antecedent or reinterpret an
invalid link. Structurally valid `new` can still be semantically wrong if relevant
history is not selected or a verifier falsely approves it.

Two archived pre-campaign casualty responses used nonexistent truncated IDs.
Their immutable responses are retained; tests now explicitly expect rejection.
They are not counted as valid-output compatibility failures or silently edited.

## Arabic UI and editorial acceptance

Closed display-only localization gaps in source-input placeholders/example
buttons. Known API errors use the existing dictionary; unknown transport/API
failures use a localized generic failure while retaining original technical
information in `Error.cause`. English error detail remains available. Standard
`Error: ` prefixes no longer leak into translated interface labels.

The effective catalog and static UI calls have Arabic/French coverage tests.
Existing locale-aware dates, RTL, accessibility labels and direct rendering of
user/source content are preserved. Local browser checks at 1440×1000 and 390×844
confirm Arabic heading/auth dialog, `lang=ar`, `dir=rtl`, no page errors and no
horizontal overflow. API responses were mocked and external hosts blocked.
No translation or rewriting stage is added to news generation.

The [18-case final checklist](v4-final-editorial-checklist-2026-11-09.json) and
[unchanged review pack](../benchmarks/editorial-information-gain/lebanese-human-review-2026-11-08.html)
cover all seven November 6 windows, eight October 28 windows and three robbery
reader states. Every case records passing functional replay but **unproven
semantic quality** and **pending human review**. Informative concise headlines,
complementary bodies, source fidelity and natural Arabic remain editorial
acceptance criteria, not automatic trimming rules. No human scores are invented.

## Validation

- Entire briefing suite: **303 tests / 51 files passed**.
- Entire frontend suite, including catalog and API-failure regressions: **122
  tests / 24 files passed**.
- Relevant Worker suites: **94 tests / four files passed**: V4 adapter, durable
  window recovery/reuse, public-read batching and publication validation.
- Briefing, web and Worker TypeScript passed. Local production web build passed.
- Exact replay: **18 cases, 38 historical calls**, request hashes, outputs and
  represented costs unchanged. Two source-empty windows make zero calls.
- Additional malformed relation/verdict/repair, sparse ownership, explicit drop,
  exact duplicate, unavailable antecedent and unusual exact ID checks pass.
- Deir Mimas, robbery, camp attribution and traffic failures remain explicit
  semantic regressions. Fuel ambiguity is retained in real source evidence and
  complete-window replay; a green test does not mean these weaknesses are fixed.

The first full briefing run exposed stale-time and incomplete-schema mocks;
already-tested fixture/clock fixes from the research branch resolved them without
weakening guards or changing the actual historical source/response artifacts.
Tests do not use live providers. Native tests use isolated local databases and
mocked model transports. The previous campaign ledger is never a test database.

## Cost, latency and financial preservation

New inference calls/cost: **0 / $0**. Valid V4 request bytes and stage counts are
unchanged. The 38 replayed calls represent **$0.1215764 of historical charges**,
not new spending. There is no new measured provider latency or Arabic-quality
result for this release. Malformed replies can now incur the existing accounted
format correction instead of being silently accepted; its frequency/cost is not
estimated from valid-response replay.

Read-only before/after comparison including SQLite WAL confirms all **1,239
reservation/settlement comparison rows and all five full quarantine documents
unchanged**. Actual campaign
spend remains **$4.472889622**, unknown holds **$0.188534125**, buffer **$1.25**.
No hold is spent/released and no uncertain request is resent. Original $8
permission and $7.50 internal ceiling remain intact.

[Machine-readable validation](v4-final-integration-validation-2026-11-09.json)
records exact source-pack and unchanged-runtime hashes. Original research
reports, paid receipts, experiments and benchmark evidence remain preserved in
the research branch/worktree; the acceptance pack is copied byte-for-byte.

## Release boundary and rollback

This is the best-supported **V4 reliability consolidation**, not V5 and not a
claim that the central semantic/editorial goal is solved. Remaining limitations
include partial-post novelty, fuel ambiguity/repair contradictions, accident
selection, unsupported attribution, semantic relationship truth, long-history
retrieval and professional Arabic judgment. No failed experiment is activated.

There is no migration or deployment step. Review the integration-only delta from
`cc450d21`, then merge according to the project's normal process. Deployment
requires a separate explicit approval. Changes are isolated in commits so the
engine safeguards, UI localization and release evidence can be reverted
independently. Stop here; no further paid or architectural campaign is started.

Integration commits before this report:

- `fd2cce48`: qualified engine safeguards, strict/clock regressions and frozen acceptance/replay data.
- `5d33ca7f`: UI localization and tested localized error handling.

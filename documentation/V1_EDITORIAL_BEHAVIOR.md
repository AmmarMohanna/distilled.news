# Editorial behavior v1 implementation record

This records implemented behavior and local proof. The end-to-end phase remains
in progress; the task ledger is `docs/superpowers/plans/2026-10-04-distillation-editorial-v1.md`.
The frozen architecture and connector contracts remain authoritative.

## Previous communication

Selections compare actual published claims with current supported facts through
stable Event/Storyline lineage. Evidence supporting an earlier edition is not
automatically reader knowledge. Typed selection metadata retains exact earlier
edition/target/claim/support references, supported additions, repeat penalty and
initial context/treatment guidance.

Conservative deterministic equivalence preserves argument order, attribution
punctuation, numbers and attached units/signs/operators, negation, temporal words
and progressive versus completed actions. It recognizes a narrow set of lexical
equivalents; it does not claim general semantic entailment.

Independent reports can increase corroboration without producing another story.
Quiet windows settle the existing durable request without an edition, synthesis
or delivery job. A communication fingerprint fences cached selection, provider
reservations and publication. Reconciliation retains spent budgets and never
reopens an unknown provider outcome. Changed source epochs trigger selected
support revalidation; unrelated ingestion does not itself revoke authorization.

Milestone A pushed commit: `9c103af0d6654a13d838fcca065327cfacd2e6b8`.
Local proof: 29 focused editorial/fact/selection/publication/runtime tests, 44
contracts tests and all seven workspace typechecks passed. Reviewed defects were
reproduced before fixing. Earlier recovery-test deadline failures passed in
isolation and in final focused runs without changing the existing deadline.

## Live intervals

Normal live durations are 30, 60, 120, 360, 720 or 1440 minutes. `FeedRecord`
optionally retains `briefingSchedule`; durable request/selection windows retain
the duration, IANA timezone, optional local delivery anchor, concrete UTC bounds
and schedule policy. Legacy `windowKind` stays a compatible coarse category:
30 minutes → `30M`; 1/2/6/12 hours → `HOURLY`; 24 hours → `DAILY`.
Window assessment identity includes the complete window configuration and
communication context. There are no separate ranking engines for each interval.

Policy `local-calendar-anchors-v1` closes windows at a local daily anchor
(default `00:00`). A 24h schedule is one local calendar day: DST can make its
elapsed bounds 23 or 25 hours. Shorter durations advance by elapsed minutes from
the local anchor. Any remaining fragment closes at the next daily anchor, so
adjacent windows leave no gap or overlap; that final DST-day fragment can be
shorter than the nominal duration. The concrete bounds remain canonical.
Nonexistent anchors move forward through the gap; repeated anchors select the
earlier occurrence. This uses Temporal's explicit `compatible` disambiguation,
not hand-coded timezone offsets. See the [Temporal timezone documentation](https://tc39.es/proposal-temporal/docs/zoneddatetime.html).

The existing protected `/v1/downstream/enroll` accepts optional configuration:

```json
{
  "sourceId": "an-already-approved-canary-source",
  "ownerId": "its-owner",
  "briefingSchedule": {
    "durationMinutes": 1440,
    "timezone": "Asia/Beirut",
    "deliveryAnchor": "08:00"
  }
}
```

Runtime authorization, canary source scope, active owner/source checks and guarded
product configuration updates apply before enrollment. Migration
`0043_v1_live_intervals.sql` adds a nullable duration column and lifecycle
triggers. Existing product cadence edits clear a previous custom live override;
simultaneous explicit interval/cadence updates preserve their new interval.
Schedule changes fence in-flight work and increment Feed revisions.

Historical UTC/weekly windows remain readable and explicitly reproducible.
Weekly configurations are excluded from new live cron scheduling. Historical
tables are not rewritten or deleted. New live wire requests reject unsupported
durations, fixed UTC offsets, missing policy/timezone and noncanonical bounds.

Local milestone B proof: 18 timezone/wire tests; focused product, runtime,
selection and RSS-with-real-local-R2 fixtures passed (34 passed, one opt-in live
RSS test skipped). Workspace typechecks passed. The Worker bundled in a dry run
with unchanged containers excluded. The declared full build compiled packages
and web assets, then stopped because the Docker CLI required for the existing
browser container was unavailable.

No remote migration, deployment, real model experiment or deployed proof has run
in this phase. Deployment still requires confirmation of the authorized
development/test target. Adaptive synthesis, disagreement preservation,
long-window grouping and comparative evaluation remain subsequent milestones.

## Interval-aware treatment and synthesis

The same window engine continuously shifts weight from novelty/recency/material change toward impact/persistence/turning points as nominal duration grows. WindowScore remains separate from salience and relevance; suppressed editorial decisions score zero for the window. Repeat penalty reduces novelty without hiding distinct supported facts.

New live 12h/24h selections use exact current StorylineVersion targets where available, with ungrouped Events retained. A 24h approval/signing fixture emits one story citing both EventVersions and both evidence revisions; a short-window selection remains event-focused. Multi-event long-window stories receive HIGH context/DETAILED treatment; simple single-fact stories remain BRIEF. These are guidance categories, not fixed prose lengths.

Synthesis receives typed supported delta and treatment/context guidance. Full communication history stays immutable in SelectionRecord; model context uses only the most recent relevant edition with bounded background. Selection budgets the shaped input payload, rather than evidence text alone. Evidence choice covers distinct delta facts; the deterministic fallback quotes complete short representations for every selected evidence item instead of silently dropping later sides/developments. Larger/translated inputs require the configured bounded model.

Explicit boilerplate can be suppressed only when no additional non-feed terms survive removing the boilerplate. Literal keyword nonmatches remain unknown semantic relevance and influence ranking; they are not sufficient to suppress a local or paraphrased development. Human relevance evaluation is still required.

Verification: treatment/editorial/facts focused run 18 passed; updated facts/model run 6 passed. Existing publication recovery hit its unchanged 5s deadline in the broader run and passed in isolation (4.34s). No timeout/assertion was relaxed. Worker typecheck and diff check rerun before commit. Disagreement-preservation enforcement and experimental scorer/evaluation work follow separately.

## Disagreement and uncertainty preservation

Grounding now checks information preservation as well as claim entailment. Quantities, ordinary negation, uncertainty, attribution-containing qualified statements and unresolved outcomes are conservative required facts from the selected complete representations. Each required side must be quoted from its own exact revision and communicated in the reader-visible claims. Exact full-context extraction satisfies this deterministically; paraphrases/translations require the existing verifier to return offered preserved-fact IDs in the same reserved grounding call. Supporting quotes alone do not establish reader-visible preservation.

A reading ceiling drops an over-budget story whole. A collective preservation verdict is never reused after clipping its opposing claim, and semantic verdicts are accepted only for the complete supported proposal set. Unsupported claims remain omitted and provider-call budgets/recovery remain unchanged. Historical optional verifier results remain readable; missing preservation verdicts can pass only via conservative literal preservation.

Local fixtures: government20 vs unionover100 retains both source sides and unresolved discrepancy; truthful one-sided synthesis fails; loss of 'may' fails; separate 'not approved' outcome survives as a requirement; concise verified paraphrase succeeds with both revision supports; reading-budget clipping cannot create one-sided consensus. Final preservation file: 7 passed. This is local deterministic/synthetic-verifier proof, not a human quality evaluation or deployed production proof. Quantitative/caveat detection is deliberately conservative; semantic importance and prose usefulness still require frozen human labels.

Final G verification: preservation9 +model2 =11 passed. Word quantities/quantifiers (two versus three; all versus some) and Unicode numbers are protected. Unknown/non-English representations conservatively preserve all offered complete facts; translations rely on the same grounding verdict. Independent final review reported no further material G findings. Publication isolation: seven existing tests passed; recovery still hit its unchanged5s deadline in full-file and individual reruns under current load. This remains reported rather than hidden or relaxed.

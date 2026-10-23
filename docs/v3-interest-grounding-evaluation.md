# V3: interest guides selection, sources support reporting

## Retained change

One general editor instruction separates interest-based selection from factual
reporting. The interest profile is not evidence of a connection, nationality,
consequence or explanation of why the news matters. Select a relevant development
and report it plainly, or omit it; do not manufacture its relevance.

One general verifier instruction flags unsupported reader-topic implications even
when hedged, while explicitly accepting source-supported consequences, attributed
predictions and concise reporting. Neither instruction names a country, company,
vulnerability or special-case keyword rule. Model routing, schemas, accounting,
scheduling, source selection code and publication machinery are unchanged.

The existing targeted repair prompt already removes unsupported wording without
adding facts. No repair prompt change, new stage, agent or mandatory call was needed.

## Frozen evidence and experiment

Starting revision: `3655606`, `feat/v3-post-integration`.

The seven labelled cases contain:

- Exact retained English and Arabic published drafts and their full original
  Telegram source, post `https://t.me/lebanonnews2/107625`.
- Concise alternatives omitting the unsupported relevance commentary.
- Explicitly synthetic controls: a source-attributed effect on Lebanese exports,
  a conditional public-health risk, and an invented agricultural-lending effect
  appended to a bank app update.

The real drafts are two language outputs of **one source**, not two independent
news events. Labels are assistant-reviewed source entailment, not independent
human gold. Source bytes and hashes are preserved. Accurate English and Arabic
alternatives are tested separately to avoid interpreting translations as duplicate
stories. The three new synthetic controls were frozen before paid results; they
are not acquired real news or comprehensive multilingual qualification.

The user explicitly approved at most 14 calls/$0.19. Eight verifier requests compare
baseline/candidate bad and good groups separately in English and Arabic. Four
editor requests compare baseline/candidate on the same three sources per language.
Changing the editor instruction and changing the verifier instruction were tested
separately; matched requests differ only in their respective system prompt.

Models remain GPT-4.1 for editing/repair and GPT-4.1 mini for verification, JSON
mode, temperature 0.1. Verifier output cap: 2,000; editor/repair: 1,000. There are
no automatic paid retries. The two conditional calls used the existing repair
prompt on the flagged English drafts and then the candidate verifier for recheck.
No deployment, live-feed edits or historical receipt changes occurred.

## Results

| Fixed verifier case | Baseline | Candidate |
|---|---|---|
| English “such drills may have regional security implications” | Incorrectly approved | Correctly flagged |
| Arabic added relevance to followers of Lebanon | Incorrectly approved | Correctly flagged |
| Invented agricultural-loan benefit | Correctly flagged | Correctly flagged |
| Concise English and Arabic announcement without relevance commentary | Both accepted | Both accepted |
| Explicitly attributed export consequence | Accepted | Accepted |
| Source-supported conditional health risk | Accepted | Accepted |

Thus the candidate corrected the two retained false approvals without a false
rejection among these four supported controls. This is a narrow, single-run
comparison, not an estimated production error rate or proof other factual errors
are fixed. Previous date/temporal failures have not been shown resolved.

Both editor versions selected the two directly relevant synthetic developments
and omitted the drills story in this mixed batch. **No improved selection rate is
claimed.** In English, however, the baseline invented “Lebanon's transport ministry”
and “Lebanon's health ministry” from sources saying only “the ... ministry.” The
candidate kept those actors without inferred nationality. Interest in Lebanon
does not establish which country's ministry made the statement. This supplies
additional evidence for the same general grounding change beyond the original
drills commentary. Arabic selection and bodies were largely unchanged.

Limitations from reviewing the generated editor text remain: both Arabic editor
versions used a more definite export-effect headline than the source's “could
delay” wording, and rendered lack of confirmed illness increase as lack of a
recorded increase. These are baseline-shared modality/precision concerns, not
evidence of a completely accurate briefing or new candidate-only failures. They
were documented rather than prompting another unapproved experiment.

## Actual targeted repair

GPT-4.1 repaired two flagged English items in one call:

1. Retained the announcement of the planned drills and removed the unsupported
   regional-security sentence.
2. Retained the bank's statement-download feature and removed the invented loan
   benefit. It did not add an alternative explanation of relevance.

Both were accepted on recheck. Source assignments remained mechanical and unchanged.
Offline replay through `generateBriefing` uses these actual paid verifier/repair
responses and mechanically remaps short refs for the replayed subset. It verifies
the existing `edit → verify → repair → verify` flow and source ownership. The
offline editor is scripted; this is **not** a newly generated, independently
reviewed persisted edition or an exact paid-request replay after normalization.
No published feed text was overwritten.

## Cost and timing

All **14 calls settled for $0.024674**, below $0.19; zero new outstanding experiment
holds. All permitted calls are used. No previous authorization was reused.

| Operation group | Calls | Actual USD | Sum of response/settlement times |
|---|---:|---:|---:|
| Baseline verifier | 4 | 0.0020676 | 21.292s |
| Candidate verifier | 4 | 0.0016468 | 14.470s |
| Baseline editor | 2 | 0.0089760 | 11.060s |
| Candidate editor | 2 | 0.0094840 | 4.973s |
| Conditional repair + recheck | 2 | 0.0024996 | 4.341s |

These are single calls on small fixed groups, exclude reservation/setup time,
and are not delivery latency or sustained speed/cost improvements. Caching,
response lengths and ordinary variability affect the comparison. Extra prompt
tokens have a recurring cost even though candidate verification happened to cost
less here. Catching a previously approved error can legitimately add the existing
repair/recheck calls; no new calls are mandatory for clean items.

## Reproducibility and verification

- `test/fixtures/v3-interest-grounding.json`: original source text, labels and exact
  baseline/candidate prompts. Only the first source is retained real reporting;
  synthetic sources are explicitly labelled.
- `benchmarks/results/v3-interest-grounding/summary.json`: every exact request,
  SHA-256, response, token/cost usage, timing and scored verifier row. No secrets.
- `.local-reports/v3-interest-grounding/`: approval manifest, provider payloads,
  conservative reservations and independent ledger read-back retained locally.
- `interest-grounding.test.ts`: source/request integrity, matched comparisons,
  recorded positive/negative controls, native repair flow and provenance.
- Historical controlled-model evaluation now reconstructs its **frozen old system
  prompt**, rather than incorrectly substituting the new product default into
  previously billed requests. Historical model results and sources are untouched.
- Briefing tests: **64/64 passed**. Briefing and Worker TypeScript checks passed.
  No deployment or notifications.

Retain the two narrow instructions because of the controlled grounding improvements
and successful supported-impact controls. Do not describe this as solving general
verifier reasoning, proving sustained savings or validating a new live briefing.

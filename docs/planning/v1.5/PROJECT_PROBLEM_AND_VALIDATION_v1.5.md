# Distilled.news — Project Problem and Validation v1.5

**Reviewed:** 2026-09-22  
**Status:** Proposed study protocol and required evidence; no interviews, observations, pilot outcomes or course compliance are claimed completed.  
**Basis:** User-supplied review notes and the v1.5 target pack. The original course rubric was not supplied for this revision; verify its exact submission requirements separately.

## 1. Target users and evaluation cohort

Distilled serves people monitoring a topic, geography, organization or domain across fragmented public sources. Analysts, researchers, journalists and policy professionals are representative users, not an exclusive market definition.

Before recruiting, select and record one initial evaluation cohort, its profession or role, monitoring responsibility, languages and typical frequency. Choose participants who already perform that work. The initial Lebanon/MENA evaluation corpus is a proposed test context, not proof that these users have been validated. Record the cohort decision under V0 before claiming product fit.

## 2. Current manual workflow and pain-point hypotheses

```text
define monitoring question
  -> check known publishers, aggregators and permitted social/public sources
  -> open and compare overlapping reports
  -> distinguish repetition from independent corroboration
  -> reconstruct developments and what changed since the previous check
  -> decide importance and write/save a recap with sources
  -> repeat later while retaining context manually
```

The following are hypotheses to test, not observed findings:

| Hypothesis | Evidence to collect |
|---|---|
| Repeated checking takes substantial time | Timed workflow observation and participant diary |
| Duplicate reports obscure independent evidence | Sample overlapping reports and ask how they are compared |
| Important updates are missed across sources/languages | Participant examples checked against dated source material |
| Context is lost between monitoring sessions | Observe how previous developments are recovered |
| Summaries are distrusted without inspectable references | Ask participants to verify claims and explain trust decisions |
| Frequent notifications recreate overload | Ask about existing notification habits and acceptable triggers |

Keep observed findings, participant interpretations and team hypotheses separate. Do not invent interview quotes or retrospectively label assumptions as user research.

## 3. Tasks Distilled augments

| Task | Target assistance | Human responsibility |
|---|---|---|
| Define interests | Feed configuration and verified source recommendations | Choose intent, optional sources, language and cadence |
| Collect permitted evidence | Shared acquisition, retries and truthful coverage reporting | Review coverage gaps and source suitability |
| Compare reports | Deduplication, evidence roles and independent-source provenance | Inspect ambiguous or disputed evidence |
| Follow developments | Inferred events and versioned storylines | Interpret uncertainty and implications |
| Catch up | Ranked, grounded briefing for an explicit feed or Home scope | Read references and make consequential judgments |
| Receive updates | Opt-in, bounded meaningful-change notifications | Grant permission, change preferences or opt out |

Published feeds remain public by design. Research participation does not require publishing personal information or confidential monitoring questions.

## 4. Why bounded agentic behavior helps

Agentic behavior is justified where the next permitted action depends on evidence observed during the task: finding an additional independent source for a coverage gap, adapting navigation when a deterministic extractor fails, or synthesizing selected evidence under explicit reference and length constraints. Compare these capabilities with deterministic baselines; do not assume an agent improves every task.

The Web Operator is a retained high-cost fallback, not a default scraper. The Acquisition Router admits it only after cheaper eligible routes prove insufficient and policy/budget checks pass. Its discovery outputs pass through Candidate Intake. Its retrieval outputs return to normal acquisition and normalization.

## 5. Deterministic and human-controlled boundaries

Deterministic controls own authentication/authorization, URL and network eligibility, canonicalization, cheap deduplication, schema checks, cost reservations, deadlines, source checkpoints, idempotency, fencing, storage and publication rules. Model-generated judgments are versioned decisions, not authority to alter these controls.

Humans control feed intent and preferences; operators control provider credentials, deployment accounts, policy and spending limits. Research annotators adjudicate gold labels. Browser agents cannot authorize themselves, bypass access restrictions, publish/send messages, or approve their own adapter promotion. The product is not an open-ended chatbot.

## 6. Constraints

- Cloudflare-first v1 deployment into an operator-controlled account; the VPS is for API/scraper experiments.
- Public source permissions, source terms and retention limits constrain acquisition and research capture.
- Finite acquisition/model budgets and deadlines; report partial coverage honestly.
- English, Arabic and French output must be evaluated separately from source language.
- Preserve source references, uncertainty, account isolation and private operational data.
- Pencil illustrations are decorative interpretations, not evidence of an event; generation failures must not block briefings.
- Exact quotas, latency/cost gates and sample sizes remain proposed until V0/M0 freeze them.

## 7. Success criteria and measurement

Freeze numerical targets, denominators, sample plan, task windows and analysis before the final pilot. The criteria below define what to measure, not fabricated passing scores.

| Outcome | Measure | Comparison / acceptance rule |
|---|---|---|
| Less manual effort | Median task completion time; source pages manually opened | Paired manual versus Distilled tasks; predeclare minimum useful improvement |
| Important developments retained | Important-event recall at a fixed briefing budget | Independent adjudicated reference set; predeclare acceptable recall and omissions |
| Lower repetition | Duplicate or redundant briefing entries per task | Same topic/window/budget for both conditions |
| Grounded claims | Supported factual claims / audited factual claims; resolvable reference rate | Predeclare gate and adjudicate disagreements |
| Useful temporal context | Correct change/turning-point identification | Frozen event/storyline labels and participant task answers |
| Trust and usefulness | Fixed questionnaire plus qualitative explanations | Report distribution and negative feedback, not only favorable examples |
| Affordable operation | Cost per successful task/briefing and p50/p95 latency | Include failed routes, retries, agent calls and image costs separately |
| Safe operation | Relevant failure-matrix control tests | No release of a capability with an unresolved critical authorization or external-effect failure |

Product validation, acquisition benchmarks and held-out intelligence evaluation are separate evidence streams. A successful scraper benchmark does not establish user usefulness. A small convenience sample supports exploratory findings, not population-wide claims.

## 8. Interview and observation plan

1. Record the cohort and recruitment criteria. A small initial sample (for example 3–5 relevant users) is a planning suggestion, not a completed or statistically sufficient study.
2. Obtain consent; explain data collection, withdrawal, retention and anonymization. Avoid collecting passwords, tokens or confidential source material.
3. Ask for a recent concrete monitoring task: which sources were checked, in what order, how reports were compared, what was missed and how the recap was used.
4. Observe a permitted representative task where feasible. Record duration and actions; separate observation from inference.
5. Ask participants to rank pain points and specify what would make a briefing useful or untrustworthy.
6. Summarize converging and conflicting findings. Update assumptions and scope transparently before freezing the pilot.

Use anonymized IDs and store consent/private notes outside the public document pack. The public evidence artifact should contain a redacted synthesis, limitations and a trace from findings to design decisions.

## 9. Pilot protocol

- Use bounded monitoring tasks with matched topics, languages, windows and information availability. Counterbalance manual/Distilled order and use distinct matched tasks to reduce learning effects.
- Freeze app revision, route/model/prompt versions, success thresholds, scoring guide and analysis plan before collecting final results.
- Use independent assessment of important developments and grounding where feasible; record adjudication and assessor limitations.
- Record failures, missing coverage, dropouts and adverse feedback. Do not remove failed tasks merely to improve reported averages.
- Run final held-out evaluation only after development choices are frozen. Any subsequent tuning invalidates a fresh-test claim for that partition; use a newly sealed partition for a new final claim.
- Report task-level results, uncertainty, costs and study limitations. Do not equate a planned protocol with executed evidence.

## 10. Deliverables and release gates

| Gate | Required artifact | Initial status |
|---|---|---|
| V0 | Cohort definition, hypothesis register, consent plan, workflow diagram, anonymized research synthesis | Planned / evidence not supplied |
| M0 | Versioned split manifest, label guide, leakage audit and sealed final test partition | Planned / evidence not supplied |
| Pre-pilot | Frozen metrics, thresholds, task protocol and system configuration | Planned / evidence not supplied |
| Final evidence | Manual-vs-Distilled results, held-out metrics, failure evidence, costs, limitations | Planned / evidence not supplied |

See [Implementation Plan](IMPLEMENTATION_PLAN_v1.5.md), [Failure Matrix and Threat Model](FAILURE_MATRIX_AND_THREAT_MODEL_v1.5.md), and [Acquisition Benchmark Runbook](ACQUISITION_BENCHMARK_RUNBOOK_v1.5.md). Track actual completion in evidence records, not by changing this plan into an unsupported success report.

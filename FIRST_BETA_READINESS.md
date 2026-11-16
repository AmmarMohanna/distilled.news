# First public beta readiness — 16 November 2026

**Decision: NO-GO for an unrestricted public beta.** The release candidate has green Project checks and Briefing evaluation. The application boots, and current staging publishes supported English updates on schedule. Production has no feeds or editions, however, so its registration/email/source/publication lifecycle has not been exercised. Security triage, an approved production pilot and its spending scope remain gates. This is a release qualification, not a research campaign.

## Candidate and deployment identity

- Candidate: `release/first-beta-readiness`, based on `ghada/v4-transactional-briefing-recovery@59c7c599`. Fix commits: `097e0d2b` and `5dd994ee`.
- Production: `https://distilled-news-production.distillednews-platform.workers.dev`, active version `c1251f19-5b0e-4780-b97b-1ca5f740f6e4`, 100%, deployed 14 November 19:49 UTC. Previous version `884c88b3-3479-43bc-a2fb-428c68240752` is recorded as a rollback candidate, not automatically certified safe.
- Effective engine: **V3 generation core, V4 editorial prompt**, GPT-4.1 editor and GPT-4.1-mini verifier. `BRIEFING_PROMPT_VERSION` is unset; downloaded deployed code explicitly defaults it to 4. Occurrence-aware novelty and complete source decisions are present. This was checked against deployed code, not inferred from a branch name.
- Downloaded production module SHA-256: `b2dd4c8a906da6ce5915ea7efc6d2aeb2a30f7ebcb80291ec47f52a240ddeda8`. `generateBriefing`, prompt selection and prepared-delivery functions match the candidate build exactly. Selected preparation/application functions differ only in bundler-generated identifier suffixes. This is **not** a full deployed Git-SHA attestation. The candidate's patched XML library is not deployed.
- Production D1 `070dcb92-88e1-463b-bb93-b95b81203810` is distinct from staging D1 `ab259bfe-6029-4e20-8cb6-eea6b7a67459`; production archive and queues are separate. The source-execution VPC service is shared with staging. Its production Google/Telegram behavior is not independently qualified.
- Production has one enabled, email-verified admin matching `distilled.news@outlook.com`, **zero feeds**, and no edition-delivery pointers. The migration ledger includes `0093_cutoff_readiness_relay.sql`. No password was read, recovered or changed.
- Application cron is every minute; evaluator and observer crons are every five minutes. Final read-only refresh at 14:35 UTC confirms the same version, one account and zero feeds. Evaluator metadata at 14:35 UTC reports successful discovery, zero queued jobs and successful Grafana export. This verifies technical activity, not editorial correctness or alert delivery.
- `distilled.news` serves a different application snapshot from the supplied production Workers URL. Choose and qualify the public beta origin explicitly; do not switch DNS or merge `main` assuming parity. `main@37eb30e1` is an older, substantially different snapshot and the common ancestor, not this release candidate.

## CI and minimal fixes

| Finding | Evidence and disposition |
|---|---|
| Six novelty fixture TypeScript errors | Reproduced locally and in [base Project checks](https://github.com/AmmarMohanna/distilled.news/actions/runs/43637253017). Missing token usage fields in fake `ModelResponse` objects. `097e0d2b` supplies zero-valued fixture metadata; no assertion or runtime behavior changed. |
| Untrusted RSS parser dependency | Runtime imports `fast-xml-parser` 5.3.0. `5dd994ee` pins 5.12.1 and its resolved lockfile. Adds an externally time-bounded subprocess regression for a malformed, whitespace-heavy XML attribute, retaining rejection assertions. All 57 selected RSS/collection tests pass. |
| Release Project checks | [Run 43859464577](https://github.com/AmmarMohanna/distilled.news/actions/runs/43859464577), commit `5dd994ee`: **all 12 jobs passed**, including workspace typechecks/tests/build, browser checks, V3/accounts/browser correctness fixtures and fixture load/fault/recovery jobs. Fixture performance is not production capacity evidence. |
| Release evaluator regression | [Run 43859464645](https://github.com/AmmarMohanna/distilled.news/actions/runs/43859464645): **PASS**. This is offline correctness, not a paid quality experiment. |
| Research branch failures | `research/continuous-value@a2ee36d4` passes evaluation but its Project checks fail. The V3 failure expects `INTAKE_DEFERRED_AT_CUTOFF` where that branch returns `ACQUISITION_DEFERRED_AFTER_VERIFICATION`; browser failures concern a different reader/UI snapshot. No app/package/browser-test changes exist between its parent `92be8812` and `a2ee36d4`, so these are inherited by that research commit, not evidence of a regression from this release's two fixes. They are not labeled flaky or waived on the release branch. |

Local verification additionally passed: full workspace typecheck; 176 existing app/V3-window/readiness tests; 17 selected Chromium onboarding/feed/navigation fixtures; 57 RSS tests; 105 operator-script tests; web build; and production-config Worker packaging with `--dry-run`. Native tests use local databases and scripted providers. Live production and staging landing pages start without JavaScript/request failures. The redundant complete local workspace run was stopped after the exact-commit full GitHub run passed; its partial log is retained as incomplete, not counted as a pass. No model inference, deployment or live account/feed creation was performed by this qualification.

The parser update is relevant to real source ingestion. PR #11's proposed 5.11.2 still falls in the newly disclosed validator issue's affected range; upstream fixes it in [5.12.1](https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories/GHSA-7cfw-w2rf-f3jc). The collector already rejects DTD/entity declarations, so do not describe all older entity advisories as proven exploitable here. The validator path still processes untrusted input. No broad dependency upgrade, prompt change or architecture change is included.

## Actual retained briefing inspection

Read-only sample: three consecutive **English staging editions on 16 November**, with original frozen inputs, their actual prior reader histories, final decisions, publication status and operation settlements. There are 31, 21 and 34 input revision references and 159, 161 and 162 prior items respectively; these are dependent windows, not independent accuracy samples.

| Scheduled UTC | Published UTC | Delay | Published items | Generation calls | Settled generation USD |
|---|---|---:|---:|---:|---:|
| 10:00 | 10:00:24.705 | 24.705 s | 2 | 3 | 0.0362780 |
| 10:30 | 10:30:10.666 | 10.666 s | 1 | 3 | 0.0272168 |
| 11:00 | 11:00:08.744 | 8.744 s | 1 | 3 | 0.0426128 |

Nine exact canonical `semantic_intents:` reservation IDs have matching reported settlements: **$0.1061076**, with no missing settlement in this nine-operation sample. Acquisition, earlier review, evaluator and infrastructure costs are additional; this is not the all-in cost of serving a feed. No historical hold was cleared or request replayed.

- Four published items were checked against all eight cited retained source records: Aoun/World Bank reforms, Nabatieh registry reopening, an attributed Turkish delegation report, and the Kfartibnit airstrike. Their published claims are supported in this sample. The reforms story retains four supporting sources; the airstrike retains both reporting sources. Eight public retained-evidence routes return 200. Two original X links resolve to their publisher status URLs; independent access to every original source is not certified.
- Prose is concise and English, with no verbatim story repetition across these three outputs. The report of the Turkish delegation retains attribution; the airstrike headline does not invent casualties. These observations do not prove overall factual precision, recall or superiority over a simpler service.
- The Janta shipment repeat is explicitly dropped with the prior item ID and same-occurrence explanation. The Kfartibnit incident is retained separately. Actual corrections were not observed in this three-edition sample; existing recovery/novelty tests cover controlled cases.
- Selection concerns remain visible: a new consular service announcement is omitted as routine, and a report specifying a next-month UNIFIL mission review is not communicated by the published Waltz item, whose earlier history is broader. Their source support and omission are observable; their importance/severity is an editorial judgment. Do not call every omission severe or promote it to a prompt fix without reproduction. This sample cannot clear the important-development recall criterion.
- Two historical Arabic V4 editions from 2 November are readable and largely source-grounded, but one says authorities announced a seizure where the retained French post reports a seizure without naming that announcing authority. That attribution is not established by the cited retained text. No past edition was changed. This limited historical review does not clear fresh Arabic qualification; no current French-output cohort was qualified.
- All three request records honestly say **INCOMPLETE coverage**: one failed acquisition and one blocked acquisition. The failure is a Lebanese Forces `Auto Draft` RSS observation rejected with `FALLBACK_URL_MISMATCH`; rejecting mismatched evidence preserves integrity. A different article is waiting on `ARTICLE_PROVIDER_RECONCILIATION_WAIT` (65 resource waits at inspection), preserving an uncertain provider outcome. This is not evidence that the published claims are false, but complete collection must not be claimed. Do not clear the hold or resend the operation without receipt evidence/authorization.
- A paused older AI staging feed still has seven `PAID_OPERATION_UNCERTAIN` source states and no editions. Paused/legacy health is not a fresh production pilot result. Use qualified sources and investigate receipts rather than hiding these states.

## Security scope and owner actions

[PR #11](https://github.com/AmmarMohanna/distilled.news/pull/11) is **open, draft**, head `407a44d1`, targeting `ghada/DevSecOps`. It is not merged into this branch or production. Latest CodeQL, Semgrep, filesystem Trivy and new-commit Gitleaks runs passed; its image job fails specifically at the HIGH/CRITICAL gate, not a claimed successful image scan.

1. **Private historical credential triage remains blocking.** The full-history [audit](https://github.com/AmmarMohanna/distilled.news/actions/runs/43635708917) still records 107 candidates. Its artifact listing is empty at inspection, and a passing new-commit scan does not clear history. This review does **not** confirm 107 active leaked secrets or confirm their absence. Owner must obtain/reproduce redacted findings, privately validate true exposures, revoke/rotate affected credentials, review usage/access and record dispositions. Do not publish secret values or rewrite history casually.
2. **Deploy the tested RSS fix only after approval.** Deployed production still includes the older library. Keep the security backlog visible; the candidate patch is not a live remediation until deployed and checked.
3. **Container backlog remains open:** the PR reports 6 CRITICAL/44 HIGH in the authenticated browser image, and its latest image gate remains failed. This production Worker has no authenticated-browser container/DO binding and browser acquisition is disabled, so those findings are not established as public Worker execution paths. The shared external helper is a separate dependency and has not been audited here. Do not enable or approve vulnerable optional browser functionality under this beta scope; upstream-compatible remediation is still required, not a scanner suppression.
4. Choose the beta origin, verify owner login/email access, and authorize the controlled pilot and bounded spending policy. Production model accounting is `TRACK_ONLY`, with no finite authorization grant; source collection is configured `unlimited`. Ownership, UNKNOWN fences and receipts remain in place, but these settings do not enforce a campaign monetary ceiling. No limits were silently changed.
5. Confirm repository protection/security ownership and Grafana alert routing. Successful metric export does not establish alert notification delivery.

## Release criteria

Statuses qualify the **public production beta**, with the tested narrower scope stated explicitly.

| Requirement | Status | Evidence / remaining check |
|---|---|---|
| User onboarding works | NOT VERIFIED | Live landing/session and local registration/verification tests pass; production email delivery and full signup/login not exercised. |
| Feed creation and management work | NOT VERIFIED | Backend/browser fixtures pass, including atomic first-feed configuration; no production feed creation authorized. |
| Sources are collected correctly | NOT VERIFIED | RSS regression/collector tests pass. Staging publishes with explicit failed/blocked acquisitions; production source helper/extraction untested. |
| Real briefings generate automatically | PASS — staging only | Three observed consecutive scheduled V4 editions; production has no editions. Production acceptance still pending pilot. |
| Published claims are supported | PASS — inspected sample only | Four items/eight source records; historical Arabic attribution caveat above. No population accuracy claim. |
| Citations resolve to relevant evidence | PASS — inspected sample only | All eight retained evidence routes return 200 with relevant source content; only two original links spot-checked. |
| No severe editorial omission remains unexplained | NOT VERIFIED | Recorded exclusions and source/history checks exist; importance coverage and two selection concerns remain unqualified. |
| Updates and distinct incidents handled correctly | NOT VERIFIED | Controlled cases pass; Janta repeat/Kfartibnit distinction observed. Fresh production update/correction sequence absent. |
| Arabic and English acceptable | NOT VERIFIED | English sample acceptable; fresh Arabic pilot needed, with historical attribution concern recorded. French output not qualified. |
| Scheduled publication and recovery work | PASS — tested scope | Staging timing plus green actual local/CI recovery fixtures; production consecutive-window proof pending. |
| Private feeds remain private | PASS — tested boundaries | Known private staging feed returns anonymous 404; production owner/admin APIs return 401; local cross-owner/visibility tests pass. Production private-feed pilot still required. |
| No launch-critical security/application defect remains | FAIL | Candidate fixes pass CI but are undeployed; historical credential triage unresolved. Optional image risks remain outside the approved public scope, not waived. |
| Spending and monitoring controlled | NOT VERIFIED | Nine retained operations settled; current evaluator tick/Grafana export healthy. Pilot monetary scope, full cost and alert delivery not verified. |
| Production can be rolled back | NOT VERIFIED — drill | Previous versions and dry-run package verified; explicit rollback procedure prepared. No authorized live rollback drill or current backup verification performed. |

The sanitized [evidence index](docs/release/FIRST_BETA_EVIDENCE.json) records hashes of the private read-only snapshots, exact edition IDs, settlement totals, code comparisons and CI job results. Source bodies and private operational payloads remain local and untracked.

## Shortest remaining path

1. Owner closes credential triage and confirms a beta origin, login/email access and optional-component scope.
2. Approve deployment of this green candidate and an enforceable finite pilot spending scope; do not merge research or run the continuous-value study.
3. Execute [FIRST_BETA_PILOT.md](docs/release/FIRST_BETA_PILOT.md): three real feeds, at least three consecutive due windows each, plus access/source-change/quiet/update checks with failures retained.
4. Review original evidence, delivery and settled/held costs, exercise the authorized rollback path, then change the relevant NOT VERIFIED rows. Open an explicitly labeled, limited beta only if the pilot and security gates pass.

Safe verification alone cannot substitute for the production steps the user has explicitly reserved for separate approval. No deployment, production write, live feed creation, paid model call, merge or new research experiment was performed.

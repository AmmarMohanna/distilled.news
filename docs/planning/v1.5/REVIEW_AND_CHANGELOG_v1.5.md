# Distilled.news - Review and Change Log v1.5

**Review date:** 2026-09-22  
**Inputs:** User-supplied `Distilled_v1.4_document_pack.zip` and the pasted seven-point review of the earlier v1.3 pack.  
**Result:** Updated target planning pack. No application code, credentials, cloud resources, paid experiments or deployments were changed or executed in this revision.

## Review finding

The review notes describe shortcomings in v1.3. The supplied v1.4 pack already resolves most of them. v1.5 preserves those corrections and fills the remaining specification and evaluation gaps rather than claiming all seven changes are new. The source ZIP is preserved unchanged; its hashes and the generated documents are recorded in the manifest.

The documents describe the intended product independently of today's implementation. Existing implementation behavior, including current manual image generation or provider configuration, is not silently promoted into a frozen product requirement.

## Seven-point disposition

| Review item | What the supplied v1.4 already contains | v1.5 action |
|---|---|---|
| 1. Discovery boundary contradiction | Architecture main diagram, Section 6.1 and Section 6.3 correctly use CandidateProposal -> Candidate Intake -> CandidateItem | Preserve and verify the corrected path; explicitly apply it to Web Operator discovery |
| 2. Web Operator missing/open | Full runtime companion is included and README retains the capability | Name it explicitly in the main acquisition diagram, router contracts and milestone acceptance; distinguish deterministic browser rendering from bounded agentic execution |
| 3. User/problem/course grounding | Architecture Section 1.1 and V0 provide a short workflow/user framing | Add a dedicated Project Problem and Validation document with cohort selection, hypotheses, observation/interview plan, human/deterministic boundaries, metrics, pilot and evidence gates |
| 4. No held-out set | M0, contracts and architecture require a held-out partition | Explicit train_or_examples/validation split, manifest/provenance fields, grouping/leakage rules, final-run freeze and consumed-set handling; align acquisition evaluation |
| 5. Failure Matrix/threat model absent | Dedicated document with 34 pending failure rows and threat boundaries | Preserve coverage; add evidence ownership/register fields and held-out discipline; no fabricated passes |
| 6. Acquisition benchmark aligned | Matched inputs, gold labels, permitted routes, route-policy selection and test-only VPS retained | Keep methodology; distinguish route-selection gold from a separate final acquisition test set |
| 7. Self-hosting semantics unclear | README and architecture explicitly define operator-controlled Cloudflare deployment | Preserve the definition; arbitrary non-Cloudflare hosting remains a future compatibility goal |

## Document-specific changes

- **README:** link the new user-validation companion; explain review provenance, current pack authority and evaluation partitions.
- **Architecture:** retain Candidate Intake invariants and self-hosting semantics; clarify workflow assumptions; expose the Web Operator in the main diagram and router text. The diagram is not a universal mandatory fallback order.
- **Technical Contracts:** specify Web Operator admission/output boundaries and companion ownership; replace the ambiguous instruction to run every change against the same benchmark with development/validation-only wording; define split/final-run provenance and contamination handling.
- **Implementation Plan:** link V0 to the study protocol; make M0 partitions and artifacts explicit while retaining all gold-label categories; tie Web Operator integration and safety evidence to M2/M9/M12.
- **Acquisition Runbook:** classify existing pilot/gold/canary runs as development evidence; define separate sealed final acquisition evaluation, matched inputs, domain-generalization scope, temporal validity and honest denominators.
- **Agent Runtime/Web Operator:** retain the detailed architecture and original historical implementation inspection; reconcile current companion versions/date. Browser executor selection remains open; the capability is retained.
- **Failure Matrix/Threat Model:** retain all failure rows and security controls; add accountable evidence fields and a rule against tuning on final-test failures while calling the same set untouched.
- **Project Problem and Validation:** new standalone protocol covering all requested user/workflow/course-facing areas. Sample sizes are suggestions, numerical gates must be frozen before evaluation, and observed findings are not invented.
- **Manifest:** include source ZIP/review/document hashes, generated file hashes, validation results and source-manifest checks. The manifest excludes its own hash to avoid a recursive checksum.

## Preserved decisions

Public accounts and multiple public feeds, username-scoped URLs, Home/Explore/Settings, first-class Catch Me Up at account or feed scope, retained published-feed search, no public chatbot, evidence/events/versioned storylines, three reuse layers, opt-in push, bounded agents and resource controls remain intact. Preserve existing colors/style and the centered landing/pencil-illustration direction. Image provider, automatic-versus-explicit generation and budgets remain open decisions in this pack.

Cloudflare is the v1 deployment baseline. The VPS remains for API/scraper testing. The Web Operator remains a bounded high-cost fallback/discovery capability; its production browser executor remains subject to portability, security, fidelity, latency and cost evidence. Provider-specific settings in the specialized runtime are implementation proposals under the pack's authority rules.

## Evidence limits and remaining decisions

The original course rubric, completed interviews, final cohort choice, numerical acceptance thresholds, benchmark results and production executor decision were not supplied for this revision. This pack defines how to obtain and report those artifacts; it does not certify course compliance, user validation, implementation completeness or passing security tests. Current code status must be maintained separately.

## Validation

Generation checks cover UTF-8 decoding, balanced Markdown fences, local document links, current companion filenames, manifest hashes and ZIP round-trip integrity. Focused consistency checks cover Candidate Intake, retained Web Operator/executor distinction, all 34 failure rows, explicit evaluation partitions and required user-validation sections. These are document checks, not application tests or completed research.

The historical v1.4 and v1.3 change logs remain in their original source packs; v1.5 reports only the changes made in this revision.

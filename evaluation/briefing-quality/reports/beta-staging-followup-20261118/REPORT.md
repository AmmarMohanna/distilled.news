# Staging and French-feed follow-up — 18 November 2026

**Current gate: NO-GO for claiming completed live qualification or comprehensive factual protection.** This follow-up preserves, rather than rewrites, the earlier 14-case identity-development qualification. A new French quantifier probe exposes a false acceptance. No production/Joud deployment, published-news mutation, merge or additional campaign was performed.

## Actual staging outcome

Exact implementation `8e6212e6293f4891625388bf9864e87a6e0f4119` passed Project checks [44380937534](https://github.com/AmmarMohanna/distilled.news/actions/runs/44380937534) and Briefing evaluation [44380998499](https://github.com/AmmarMohanna/distilled.news/actions/runs/44380998499). Staging-only version `ef9d70bf-87b4-4aef-9ab5-d7a03c6d51e2` enabled source-bound-claims-v2 with GPT-4.1. Its existing operator mission collected The Verge AI RSS and extracted a 7,333-character article. Intake/review completed. This was bounded one-article collection, not comprehensive source coverage.

The private feed was created at **19:50:23.651 UTC**; the article was published **19:40:36 UTC** and accepted **19:50:43.785 UTC**. The artificial mission window ended 19:50:44.439 UTC. `newsWindowEligibility` correctly classified it as pre-subscription BACKLOG. The frozen input contains zero articles; the immutable request `2f0ccacf9bf32805b9baed3e91efd2c67ded89e28a48850ac1ca55dae37d9fa0` completed QUIET with zero model calls. HTTP 200 is not a successful verifier/publication qualification. Neither source dates nor feed creation were backdated to evade admission.

Activation was disabled again: staging version **`110cb340-5492-4b0b-82dc-d924574565b6`**, with exact postflight matches for original variables, secret names, resource bindings, cron and observability. Both private pilot feeds are paused and their sources disabled; evidence and original operations are retained. Anonymous access to the second private feed returned 404. Temporary generation/evaluation reservation guards were removed after reconciliation. Production and Joud were not changed.

The next valid live test must subscribe before the article's actual publication and subsequently collect eligible evidence. The existing one-shot mission is unsuitable for manufacturing that condition by immediately collecting an older latest article. No false admission-policy fix is justified by this empty run.

## Joud culture feed: actual status and evidence

Inspected the public feed and read-only records from its separate database, not staging's database. At **20:04:41 UTC / 22:04:41 Beirut**, its public API returned **QUIET**, not failed. The 22:00 Beirut request completed at **22:00:44.180**, COMPLETE coverage, `NO_SELECTED_DEVELOPMENTS`; its frozen input had no articles. This establishes no eligible retained input for that request, not that no relevant news existed anywhere.

| Scheduled Beirut time | Observed outcome |
|---|---|
| 19:30 | PENDING, `SEMANTIC_OUTCOME_UNKNOWN`; original GPT-4.1 result/payment unresolved |
| 20:00 | FAILED after five attempts, generic `PUBLICATION_FAILED`; retained data does not establish the precise exception |
| 20:30 | Published 20:45:41 — about 15m41s late |
| 21:00 | Published 21:00:23 |
| 21:30 | DONE/DEFERRED, `INCOMPLETE_INTAKE_COVERAGE`; one `COLLECTION_DEFERRED_AT_REPORTING_CUTOFF` |
| 22:00 | QUIET, completed 22:00:44 |

The earlier delay notice therefore reflected a real incomplete-collection window, while later scheduling continued. The older unknown model operation retains **$0.07661 conservative exposure**, not a confirmed charge; it was neither resent nor cleared. Google News reports RATE_LIMIT. Acquisition DEFERRED counters must not be called acquisition failures: inspected examples explicitly use INITIAL_BACKLOG, including old Les Inrocks articles. Coverage of all external culture news is not established.

The live Worker selects the V3 engine wrapper with V4 editorial behavior, editor GPT-4.1, verifier GPT-4.1-mini, and no active source-binding opt-in. Read-only checks did not activate the candidate there.

Manual source review found support for the principal facts of the two latest stories (Iglesias proceedings and GTA review scores/nominations). Natural French and relevant citations are visible. This does not certify all eleven editions or omission recall. The Lucy Powell title is not evidence of an unsupported role: its retained source explicitly calls her Education Secretary as well as Labour deputy leader. The GTA release story's worldwide-release timing deserves caution because the source describes a staggered local-midnight launch; this was not converted into an unambiguous fault label.

## New paid factual probe: negative result retained

Before inference, froze the original French GTA reader item and its complete attached BBC passage, plus a corrected control replacing only **unanimement** with **largement**. Source says reviewers **overwhelmingly** agreed; this does not establish unanimity. The expected negative is a quantifier overstatement, not a fabricated score or actor. The corrected control is a dependent derivative, not an independent news event. Both cases used GPT-4.1 and the current source-bound-claims-v2 verifier; neither was published.

| Case | Source-derived expectation | Candidate result | Outcome | Effective calls / new provider calls | Reported usage cost |
|---|---|---|---|---|---|
| Original: unanimement | Reject unsupported universal quantifier | OK | False acceptance | 3 / 3 | $0.023656 |
| Corrected: largement | Accept | OK | Valid control accepted | 3 / 2 | $0.012432 |

One identical source-only inventory request was reused exactly within the run. Total **five new paid requests**, **$0.036088**, no new unknowns. Latencies 12.735s and 9.680s respectively. This is one exposed source event and a corrected control; no general accuracy estimate or superiority claim is defensible. `measurements.json` preserves reference hashes, actual outputs, reservation/receipt verification and the false acceptance. Existing verification already checks uncertainty/headline meaning; this result is a substantive miss, not malformed JSON. No prompt was weakened, response relabeled, or failed result replaced with a pass.

Initial local launch failed before dispatch because the isolated worktree had no secret file. That directory and preflight failure remain retained. A separate run used the existing root staging key through an ignored bundle's path adjustment; no secret was displayed, copied into the worktree or committed. Immutable paid request identities were fresh. The prior unknown request hash remained prohibited.

## Financial reconciliation and release implications

Prior local campaign settled **$3.0674276**. Conservatively counted all nine unrelated/background staging operations during the pilot interval, **$0.0625184 settled**, zero held. Both mission attempts made zero paid model calls and no evaluation jobs were created. French probe added **$0.036088**. Cumulative campaign settled **$3.166034**; historical campaign hold **$0.012416** unchanged; conservative campaign exposure **$3.178450**, below the approved $5. Joud's pre-existing $0.07661 unknown is separate, preserved and not represented as a new campaign charge.

The existing named-identity regressions still support their narrow conclusion. The new result blocks a broader assertion that all demonstrated factual overstatements are caught. Live publication qualification and consecutive eligible scheduled editions remain unperformed. No unrestricted-beta GO or production activation is justified by this follow-up.

Reproduction: existing `qualify-source-bindings.ts summarize` validates saved requests and complete receipts without paid inference. Do not rerun locked paid directories. Full source/response artifacts and deployment settings remain privately in `.local-reports/integration/`; public measurements contain hashes and actual decisions. Code did not change in this follow-up; existing exact-head CI remains the code verification, not a substitute for the negative editorial result.

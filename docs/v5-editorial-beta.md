# V5 editor-assisted beta

The beta has two controls. Automated V5 always ends in private review. An editor saves a revision, approves the exact saved digest, then explicitly publishes it. The publication transaction uses the existing V3 edition, reader memory and delivery outbox. One approved edition can create one delivery job.

## Isolated setup

1. Use an isolated Worker and D1 database with migration `0101_v5_editorial_review.sql` applied. Use beta-owned feeds and test-only subscriptions. Retain the existing V5 stage routes, OpenRouter spending admission and source-binding configuration.
2. Set `BRIEFING_V5_EDITOR_REVIEW_ENABLED=true` when generating a beta window. It saves immutable stage checkpoints and closes terminal or deferred downstream attempts with usable drafts into an editorial case. Existing automatic V5 remains a private shadow. Existing shadow runs created before checkpointing require their own archive replay rather than being recovered from older snapshots automatically.
3. Sign in as the administrator account that owns the enrolled feed and open `/api/admin/v5-editor/workbench`. Use the feed ID from the account’s feed list and select the window. Review the original sources, earlier editions, generated candidates and downstream findings.
4. Compose the edition and bind each cited source to an exact passage. Use the original reader-history link for an update or correction when appropriate. Save, inspect the saved copy and attest to factual support, scope, attribution and novelty. Rejection records a reason. A new edit invalidates any earlier approval.
5. Keep `BRIEFING_V5_EDITOR_PUBLICATION_ENABLED` unset for review-only use. Once a deployment and delivery are explicitly authorized, enable it on the beta Worker only. An authenticated owner-admin must still select **Publish approved copy** for that exact revision. Delivery respects the scheduled time and existing outbox. Test with isolated subscriptions before using any reader feed.

The workflow checks that the source revision belongs to the feed and frozen window, is still authorized, and contains the quotation. It counts headlines and bodies using the feed language’s word boundaries and rejects exact repeats. The editor judges whether a real passage supports the wording, whether an occurrence is the same, and whether an omitted condition changes the claim. Valid quotation text alone is insufficient. New reader history, source revocation, another edit, rejection or a feed revision change can invalidate the publication attempt.

## Audit and spending

The workbench exposes the frozen sources and history, checkpoint candidates, original writer response when retained, reported operation costs, every saved edit, reviewer identity and decisions. A withdrawal or source revocation leaves the durable record intact while hiding restricted source material from the workbench. Publication records the digest of the immutable edition, including final wording, cited revision IDs and exact support passages. Human approval has its own delivery-status field. The automated fidelity metric remains separate.

Review, editing, approval and publishing use **zero model calls**. If generation stops after drafting, reported charges remain attributable to the case and unreported exposure stays separate. Existing provider receipt recovery applies to operations with unresolved usage.

| Archived sample | Settled inference spend | Context |
|---|---:|---|
| English AI window | $0.043098375 | Original write and failed consolidation. No further inference for the editorial example. |
| Arabic policy and security window | $0.020019000 | Original writer and later novelty canary. The original HTTP 400 still has a separate $0.398841 hold. |
| French EU budget window | $0.027260292 | Original generation through automated final review. No further inference for the editorial correction. |

These are provider-reconciled archive costs. They do not include editor time or establish a monthly cost per feed. The new workflow incurred $0 in additional paid inference.

## Source-reviewed examples

The examples below are editorial corrections prepared from public source evidence and archived model attempts. They are illustrative copy and have not been delivered.

**English — DeepMind reports a lower estimated quantum cost for a fusion calculation**

Google DeepMind reports that its agent-designed algorithm reduced the combined qubit-and-operation cost estimate by a factor of 11.8 for a modeled fusion problem. This is an algorithmic resource estimate. The work did not measure speed on quantum hardware. [Google DeepMind research](https://deepmind.google/blog/finding-faster-quantum-algorithms-with-agents-and-formal-verification/)

**العربية — تقرير يورد بلدات إضافية ضمن الغارات والقصف في جنوب لبنان**

أفاد موقع نهارنت بأن الغارات والقصف الإسرائيليين يوم الثلاثاء 24 تشرين الثاني شملَا المنصوري ومجدل زون وزوطر الشرقية وميفدون والقنطرة. [نهارنت](https://www.naharnet.com/stories/en/323949-violent-israeli-strikes-target-south-lebanon)

The earlier reader briefing already covered five of the towns in the same Tuesday report. The five above were absent from the same-day reader history, although some appeared in coverage of earlier days. Naharnet distinguished Monday from Tuesday and gave no time within Tuesday. The additional locations are useful as an attributed reporting update. There is insufficient evidence to assert a later or distinct wave of strikes. The original machine repeat decision is preserved in the review audit.

**Français — Budget 2027 de l’UE, le Conseil adopte le texte avant le vote du Parlement**

Le Conseil a adopté le budget 2027 le 23 novembre. Le vote du Parlement était attendu le 25 novembre. Les 710,1 millions d’euros disponibles sous les plafonds de dépenses concernent l’exercice 2026. [Conseil de l’Union européenne](https://www.consilium.europa.eu/fr/press/press-releases/2026/11/23/eu-budget-for-2027-council-gives-final-green-light/)

## Release scope

Use the implementation for a limited, editor-controlled beta after deployment authorization and isolated delivery validation. Before sending to readers, apply the migration to the authorized target, confirm the owner-admin and feed, set the existing account spending cap, and exercise one approval through that target’s configured outbox with test-only recipients. Keep the publication gate off until those conditions have been met.

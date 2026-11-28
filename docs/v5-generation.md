# V5 generation on the V3 publication path

Production V5 uses the source-bound V3 window and publication path. The Worker persists the selected model, provider, price ceilings and prompt revision in the same frozen input as current evidence and reader history. The frozen Flash pair specifies the writer, downstream stages, language overrides and bounded alternate.

The historical single-writer profiles support a feed creation cutoff. The Flash pair applies to every newly frozen window regardless of feed age. Previously frozen windows retain their recorded routes and publication policy.

Production selects `flash-pair` and enables automatic publication in `apps/worker/wrangler.production.jsonc`. Validate with `python scripts/release.py validate`. The production release workflow verifies the deployed bindings before its public smoke test.

`BRIEFING_V5_AUTO_PUBLICATION_ENABLED=true` opts newly frozen V5 windows into automatic publication. Only a source-bound, verified, published result with reported durable operations can enter the existing edition and delivery transaction. The same source authorization, intake coverage and scheduled-delivery checks still apply. Already-frozen editorial and shadow windows retain their original behavior. Turning the flag off holds automatic windows for resumption and leaves shadow and editorial workflows available.

The editor prioritizes current events before using history to check novelty. New windows use prompt revision `v5-source-first-v6`. Earlier frozen windows keep their original prompts and selection rules when resumed. For new windows, the schedule sets an advisory reading target for headlines. ICU word segmentation counts the combined headlines in the output language. The writer is asked to keep optional details concise. Verified details are retained regardless of their word count. Exceeding the headline target alone never blocks publication. Repairs still require re-verification. Exhausted editor and consolidation contract failures retain affected evidence for a later window.

## Flash-only rollout profile

Set `BRIEFING_V5_GENERATION_PROFILE=flash-pair` with source bindings enabled. Leave `BRIEFING_V5_STAGE_ROUTES_JSON` unset for this profile. The worker freezes both pinned endpoints into each new window. Existing frozen windows resume with their original routes.

Gemini Flash on AI Studio Flex selects and writes the first draft. DeepSeek Flash on Wafer is its alternate, inventories reader claims and repairs English and French copy. Gemini Flash on AI Studio Flex handles Arabic repairs and the other stages, including novelty, source inventory, final verification and repair coverage. After a received invalid output, the engine gives the same endpoint one correction with the validation error. A second invalid output triggers one attempt on the other frozen Flash endpoint. Provider and accounting errors propagate through the normal recovery path. Novelty, verification, repair and recovery audit use item-sized requests; source extraction uses one source per request and reuses validated entries when they cover the required identities. Exhausted item-local checks cannot authorize publication. Writing and consolidation retain their existing joint editorial contracts.

## Baseline and rollout checks

At `0b23484e`, the ten matched windows comprised four Business & Markets, four AI Industry Watch, one Arabic Lebanon and one French Economics edition. With Gemini as writer, recorded end-to-end inference cost was $0.8901 for 41 items and 2,196 reader words. DeepSeek cost $1.1692 for 81 items and 4,576 words. Both completed ten windows. Saved responses count at their original cost. Across the eight English windows Gemini cost $0.8371 versus $4.5351 for v3.

Those figures precede the new initial-selection instruction. Newly frozen Flash windows record `individual-developments-v1`. It asks the writer to examine a source for a consequential new result or milestone before deciding to exclude it. Known limitations include missed benchmarks inside reviews, overstrong headline attribution, merging separate incidents, and downstream role checks withholding a selected story after repair.

For the first scheduled windows across existing and newly created feeds, compare the frozen writer request, source decisions, final copy and operation receipts. Check reader length, billed cost, alternate attempts, verification drops, and publication or delivery status. Inspect whether a selected benchmark keeps its testing conditions in the headline and whether an omitted source contained a material development matching the feed interest.

To pause, release the same Flash configuration with BRIEFING_V5_AUTO_PUBLICATION_ENABLED=false and verify the deployed bindings. New Flash windows and pending automatic windows wait for resumption. Confirm in-flight publication state and delivery receipts. Restoring a build that can initiate GPT generation requires separate authorization.

## Historical configurations

Earlier single-writer and mixed-model shadow trials used separate profiles, including GPT-4.1 for some stages. Their results describe those trials only. The release selects the paired Flash profile and rejects a stage-routing override, including a language override. Frozen older windows retain the profile with which they were admitted.

## Production spending and monitoring

The shared account tracks actual costs with no aggregate hard cap. Each Flash request pins its endpoint and price ceiling. Existing reservations, receipt reconciliation and provider concurrency limits apply. Catch me up uses the pinned Gemini Flex route with its existing reader quota and lifetime authorization. Its focused synthetic validation retained a pending approval and a separate library reopening in two sentences for $0.000307125 with the production JSON schema.

For each new frozen window, join its request and result to its semantic operations and reported settlements. Monitor total billed cost, unreported reservations, scheduled-to-completion delay, verified items dropped and publication or deferral reason. Confirm delivery receipts and sample published headlines against the authorized evidence for actor, attribution and qualifications. Unknown outcomes require receipt reconciliation before further spend.

# V5 generation on the V3 publication path

V5 is an opt-in writer configuration for a source-bound V3 window. The Worker persists the selected model, provider, price ceilings and prompt revision in the same frozen input as current evidence and reader history. The generation profile is attached only to the initial editor request. Consolidation, occurrence novelty, source-bound checks, factual repair and re-verification still use their existing routes.

`BRIEFING_V5_FEEDS_CREATED_FROM` limits the profile and optional V5 stage routes to feeds created at or after a fixed UTC timestamp in ISO format with milliseconds. Earlier feeds use V3. Feed edits retain the original creation timestamp, and already-frozen inputs keep their recorded model routes. Keep the cutoff fixed once a rollout starts.

Production sets the rollout in `apps/worker/wrangler.production.jsonc`. The release candidate selects `flash-pair` for feeds created at or after `2026-11-26T19:54:12.096Z`. The candidate ships with automatic publication paused. Enable it only in a separately approved release after inspecting held candidate output. Run `python scripts/release.py validate` before release. After a manual production deployment, run `python scripts/release.py verify-rollout production` with `GITHUB_SHA`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` set. The release workflow performs the same check before the public smoke test.

With a cutoff configured, `BRIEFING_V5_AUTO_PUBLICATION_ENABLED=true` opts newly frozen V5 windows into automatic publication. Only a source-bound, verified, published result with reported durable operations can enter the existing edition and delivery transaction. The same source authorization, intake coverage and scheduled-delivery checks still apply. Already-frozen editorial and shadow windows retain their original behavior. Turning the flag off holds automatic windows for resumption and leaves shadow and editorial workflows available.

The editor prioritizes current events before using history to check novelty. New windows use prompt revision `v5-source-first-v6`. Earlier frozen windows keep their original prompts and selection rules when resumed. For new windows, the schedule sets an advisory reading target for headlines. ICU word segmentation counts the combined headlines in the output language. The writer is asked to keep optional details concise. Verified details are retained regardless of their word count. Exceeding the headline target alone never blocks publication. Repairs still require re-verification. Exhausted editor and consolidation contract failures retain affected evidence for a later window.

## Flash-only rollout profile

Set `BRIEFING_V5_GENERATION_PROFILE=flash-pair` with source bindings enabled. Leave `BRIEFING_V5_STAGE_ROUTES_JSON` unset for this profile. The worker freezes both pinned endpoints into each new window. Existing frozen windows resume with their original routes.

Gemini Flash on AI Studio Flex selects and writes the first draft. DeepSeek Flash on Wafer is its alternate, inventories reader claims and repairs English and French copy. Gemini Flash on AI Studio Flex handles Arabic repairs and the other stages, including novelty, source inventory, final verification and repair coverage. After a received invalid output, the engine gives the same endpoint one correction with the validation error. A second invalid output triggers one attempt on the other frozen Flash endpoint. Provider and accounting errors propagate through the normal recovery path. Novelty, verification, repair and recovery audit use item-sized requests; source extraction uses one source per request and reuses validated entries when they cover the required identities. Exhausted item-local checks cannot authorize publication. Writing and consolidation retain their existing joint editorial contracts.

## Baseline and rollout checks

At `0b23484e`, the ten matched windows comprised four Business & Markets, four AI Industry Watch, one Arabic Lebanon and one French Economics edition. With Gemini as writer, recorded end-to-end inference cost was $0.8901 for 41 items and 2,196 reader words. DeepSeek cost $1.1692 for 81 items and 4,576 words. Both completed ten windows. Saved responses count at their original cost. Across the eight English windows Gemini cost $0.8371 versus $4.5351 for v3.

Those figures precede the new initial-selection instruction. Newly frozen Flash windows record `individual-developments-v1`. It asks the writer to examine a source for a consequential new result or milestone before deciding to exclude it. Known limitations include missed benchmarks inside reviews, overstrong headline attribution, merging separate incidents, and downstream role checks withholding a selected story after repair.

For the first scheduled windows in the existing cohort, compare the frozen writer request, source decisions, final copy and operation receipts. Check reader length, billed cost, alternate attempts, verification drops, and publication or delivery status. Inspect whether a selected benchmark keeps its testing conditions in the headline and whether an omitted source contained a material development matching the feed interest.

Use the existing publication pause (`BRIEFING_V5_AUTO_PUBLICATION_ENABLED=false`) if release monitoring finds a material problem. Verify the deployed bindings after the pause. Inspect held windows and their frozen routes before resuming. Revert the release through the existing Worker release procedure if needed. A previous binary may not understand the new selection flag; keep pending candidate windows held when rolling back.

## Historical configurations

Earlier single-writer and mixed-model shadow trials used separate profiles, including GPT-4.1 for some stages. Their results describe those trials only. The release selects the paired Flash profile and rejects a stage-routing override, including a language override. Frozen older windows retain the profile with which they were admitted.

# V3 thousand-feed capacity experiment

Goal: measure existing V3 scheduling, preparation and durable publication at 1,000 synthetic feeds; identify demonstrated bottlenecks without paid inference or shared-environment load.

Design: opt-in local Miniflare benchmark with real migrations and production query/persistence paths. Three history cohorts (0/96/480 editions), quiet/normal/saturated windows (0/3/20 full articles). Record every SQL operation's rows, bytes, duration and failures, including first/batch calls. Source evidence and model responses are explicitly synthetic. Controlled GPT-compatible responses prove integration only. Never claim local throughput equals Cloudflare capacity or real editorial quality.

- [x] Implement opt-in reproducible fixture and instrumentation; smoke with 12 feeds.
- [x] Exercise indexed feed dispatch (100 per tick), creation-relative preparation, full publication, read-back, duplicate replay and recovery controls.
- [x] Run 1,000-feed preparation plus bounded full-pipeline workloads with controlled responses, serial full-path trials and an unchanged six-slot/20-RPM provider guard. Save progress incrementally.
- [x] Fix only confirmed defects with a regression; rerun equivalent workload. Otherwise retain product code unchanged.
- [x] Report measured database work, latency distributions, bottlenecks, model throughput requirements and honest qualification limits. Run focused tests/typecheck; commit safe evidence as Ghada only.

No synthetic cloud load, paid inference, notification transport, historical financial changes or unrelated edits. Only the separately authorized final staging schema/deployment smoke step is allowed after local proof. Existing favicon and staging configuration changes remain untouched. Current plan uses no subagents.

Ruling: full-pipeline trials are bounded to 24 serial feeds at the existing 20-RPM ceiling, rather than claiming 1,000 concurrent publications or raising limits. All 1,000 exercise preparation/dispatch. Existing atomic six-slot regressions will be rerun separately. This isolates database/history measurements and demonstrates actual backpressure, at the cost of leaving cloud concurrency throughput unqualified.

Ruling: the earlier explicit authorization to finalize, deploy to owned staging and test remains applicable to the confirmed runtime correction. After local before/after and regression proof, apply only index 0079 and deploy this correction with preserved assets/bindings, followed by 25 normal reads. This revises the self-imposed local-only experiment plan, not a user restriction. No synthetic 1,000-feed workload or paid evaluation is sent to staging.

Completed: before/after 1,000 preparations, equal 24-feed publication outcomes and 20 operation IDs, 66 regression tests, typecheck, index/query-plan verification, staging asset/config checks and 25/25 smoke reads. Still NOT a 1,000-feed production qualification.

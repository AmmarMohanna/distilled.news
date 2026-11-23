# Current architecture

Distilled.news separates acquisition, editorial judgment, publication and asynchronous review. [The Worker entry point](../apps/worker/src/index.ts) and [production configuration](../apps/worker/wrangler.production.jsonc) define the deployed application shape. [AGENTS.md](../AGENTS.md) documents invariants that maintenance must preserve.

## From source to briefing

1. Configured connectors collect upstream records. Acceptance and publication timestamps, source identity and retained revisions remain distinct. Evidence selection respects the feed scope and cutoff.
2. The Worker freezes the articles, feed interests, language, model configuration and prior reader-visible history for a V3 window. Older pending snapshots retain their original policy and identity.
3. The editor selects developments and drafts evidence-linked headlines and expansions. V4 is the default editor prompt policy for new V3 snapshots unless the environment specifies another supported version. Consolidation and novelty checks compare the result with information the reader already received.
4. Source-grounded verification checks claims, evidence and qualifications. Targeted repair can retry a faulty claim under the same evidence contract. A valid citation ID and a supported whole claim are separate properties.
5. The runtime commits an eligible edition or a legitimate quiet outcome. Job identities, leases, fencing and receipt reconciliation prevent automatic resends of unresolved paid operations. Technical failures remain visible separately from quiet editions.

[Window freezing](../apps/worker/src/v1-intelligence/v3-window.ts) · [Generation and verification](../packages/briefing/src/engine.ts) · [Cutoff semantics](briefing-collection-cutoff.md) · [Recovery and publication](transactional-briefing-recovery-staging-2026-11-13.md)

## Deployment boundaries

- The application Worker serves the API and built web assets with D1 for durable state, R2 for retained payloads, and scheduled and queued work for collection and delivery. The checked-in production V3 configuration selects GPT-4.1 editing and GPT-4.1-mini verification. Other model or source routes require explicit operator configuration.
- The separate quality Worker reads frozen publication inputs and records source scope, evidence limitations, judgment versions and outcomes in its own storage. Operational monitoring exports aggregates. The evaluator does not participate in the publication decision.
- Public and private feeds share the product but have distinct backend visibility rules. Maintain owner-only reads for private histories, images and notifications where applicable. Scope authenticated acquisition helpers and provider credentials to their intended environment.
- Feed collection and editorial quality are evaluated separately. A partial retained snapshot can support an individual claim without establishing comprehensive coverage of its window. See the [evaluation index](README.md#evaluation-and-evidence) for measured limits and proposals.

The older V1 interface appendix is retained for compatibility work. Historic prioritization plans and experimental generation or judge branches are evidence of alternatives considered. Operate from the supported source, configuration and runbook for the target environment.

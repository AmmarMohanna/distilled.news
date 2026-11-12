# Unlimited staging spending implementation plan

**Goal:** Apply the user's instruction, “no more monetary limits,” to staging collection and continuous evaluation, and allow fresh collection after this feed's expired X reads.

**Architecture:** Retain source collection's existing unlimited mode and enable the existing feed-scoped fresh-read recovery policy. Add an explicit unlimited evaluator mode that omits dollar, daily-call and provider-price admission caps while preserving accounting, exact operation identities, active-request exclusion and uncertain-outcome replay fences. Preserve bounded mode for other deployments and existing tests.

**Tech stack:** TypeScript, Cloudflare Workers, D1/R2/Queues, Vitest/Miniflare.

## Tasks

- [ ] Add failing real-D1 tests for unlimited admission above historical spend/call allowances, isolated unknown accounting, no uncertain replay, settled over-estimate costs, and honest API reporting.
- [ ] Implement the optional evaluator mode in budget.ts, secret/environment typing, summary/metrics and dashboard display. Keep the current bounded default when the setting is absent.
- [ ] Configure staging evaluator as unlimited and opt only Lebanon feed briefing_68867e36-7d4f-42ac-af76-fa29dd9cbbad into the existing X recovery policy. Do not change other deployments, model selection or technical concurrency.
- [ ] Run evaluator suite and TypeScript, source recovery tests, deployment dry runs and review the final diff.
- [ ] Deploy both explicitly named staging Workers. Verify live configuration, ledger preservation, source recovery markers and evaluation admissions. Do not resend old paid requests or remove historical financial holds.

## Execution ledger

The user's instruction authorizes uncapped staging spending and ongoing fresh polling for the reported source incident. Existing claims, receipts and reservations remain factual records; removing a spending quota does not authorize fabricating successful outcomes or replaying uncertain identities.

# Mixed-source fixes — 15 October 2026

Branch: `backend-sources-mixed-source-fixes`, based on integration commit `41fea5e`.

## Changes to preserve during integration

- Discover headline links nested around headings on website section pages, including CoinDesk tag pages. A section page cannot become one full-article evidence record; empty inventories fail explicitly.
- Preserve publication/language hints on discovered article proposals.
- Add `public_article` to the private execution protocol. It uses anonymous, bounded HTTPS with no redirects or credentials. It requires the existing confirmed public-egress configuration. Authentication, challenges and policy failures remain explicit; it does not solve challenges or bypass login.
- Acquisition can use that exact-URL article path when Worker HTTP fails with a generic 403 or cannot extract an article. Only an independently identified article with a matching URL/canonical identity is accepted. Provenance records the acquisition mechanism.
- Enable Google News publisher resolution in the staging configuration.
- Report acquisition failures, pending/completed counts, collection errors and uncertain payment holds in source health and the frontend.
- Stop creating further paid polling windows for a source with an unresolved payment operation, including across fallback providers. Retain the final transaction-level duplicate-charge fence. Legacy unattributed uncertainty still blocks its provider.
- Prepare independent $15 source/provider allowances for primary and fallback, with separate aggregate deployment ceilings and per-operation ceilings. Configuration alone does not update existing durable grants.

No changes to `v1-intelligence/runtime.ts`, historical payment reservations, remote data, deployed Workers or the VPS are included in this commit.

## Rollout order and remaining evidence

1. Deploy the compatible private helper before deploying the Worker that calls `public_article`. Preserve its existing secrets and public-egress firewall. Run helper tests and verify health.
2. Review staging configuration against the intended deployment. Preserve remote secret/service bindings. Apply explicit authorized budget changes to existing durable provider grants using the existing operator path; never delete reservations or reset cumulative spending to make room. Configuration initialization may preserve old zero grants.
3. Reconcile historical X operations against authoritative provider records. Unknown outcome is not proof of no charge. Do not clear holds or resubmit uncertain requests without reconciliation. The branch prevents repeated blocked windows; it does not prove X is available.
4. Deploy Worker/frontend together. No new schema migration is introduced here; the base branch's existing migrations remain required.
5. Retry only known failed, unpaid article acquisition through supported recovery after rollout. Preserve observation identity, source authorization and history. Verify actual publisher article text, dates, canonical identity and provenance for RSS and website results.
6. Verify Google News resolves publisher URLs live, then verify Telegram, X and LinkedIn independently. Paid availability additionally requires credentials, durable authorization, remaining aggregate funds and no uncertainty fence.
7. Create a mixed-source test feed and inspect source health before publishing. Compare published facts against individual acquired articles. Local tests/builds do not establish live collection, full recall or briefing quality.

The reported staging failures require this rollout and payment reconciliation; they are not claimed fixed on the running site by a local commit.

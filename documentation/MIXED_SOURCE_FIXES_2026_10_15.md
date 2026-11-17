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

## Targeted X/LinkedIn operational repair

The subsequent staging repair changes configuration only, preserving the deployed code and unrelated bindings:

- X primary, X fallback and LinkedIn deployment limits and existing D1 grants are each $15. The per-source/provider cap is $15, TwitterAPI.io request ceiling $0.01 and Apify actor ceiling $0.25. Existing reservations are retained; unrelated provider grants are unchanged.
- The sole legacy unattributed TwitterAPI.io operation `98ad1e956b77a779f3c9cbd20a28bddcb9c3c15add2ab4c89eab2ceae306fafa` matches one immutable fetch run on feed `briefing_e4a09418-6702-4546-ac94-055fe70dd9ec`, source suffix `apify_x_profile_1o7k6ao`. Its operation ID is exactly SHA-256 of the canonical JSON tuple `[scope, run_id]`. Restoring these missing scope columns removes the incorrect global fence without resolving its unknown outcome or changing its $0.01 reservation. That original source remains fenced across primary and fallback.
- `scripts/attribute-legacy-x-operation.mjs` provides dry-run and explicit `--apply` modes for this narrow repair. It accepts only an unattributed, unresolved TwitterAPI.io operation with exactly one matching immutable run, compares the original request hash during update, and verifies that payment state is unchanged. It does not call a provider or manufacture a response.
- Historical blocked polling jobs are retained. New ordinary polling windows for unrelated, approved sources can proceed. Live acquisition evidence must still be checked; configuration admission alone is insufficient.

Live verification on the Bitcoin mixed-source feed: the normal 17:55 UTC window created X job `fa699f90aa6dd11c3d2e78baac25a98ca4b7606a3e8ad5732d2a02c1c9468dd4` and LinkedIn job `f6116487b9ab94483217730d5ea2d5db43133f6d366e1367bb9542001d6f8707`. Each handed off 20 posts into ACQUIRE jobs. At the verification snapshot, X had 6 acquisitions DONE, 2 RUNNING and 12 PENDING; LinkedIn had 4 DONE, 1 RUNNING and 15 PENDING. Corresponding REASSESS jobs were pending. This proves live collection and acquisition progress, not complete recall or published briefing quality. No manual replacement paid call was used.

The branch also allows operator recovery of a previously blocked immutable poll after all applicable payment fences have actually disappeared. A remaining source-scoped or unattributed provider hold still prevents recovery. The live verification used fresh ordinary windows and did not reset historical blocked jobs.

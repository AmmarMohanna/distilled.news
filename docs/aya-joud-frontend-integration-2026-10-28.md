# Aya / Joud frontend integration

Integration branch: `aya-joud-frontend-integration`.

Inputs are Aya's `aya-ghada-integration` at `400dae2` and Joud's final
`joud/frontend-fixes` at `22ebe8c1d561d99a7921eaf7474d2df8c33053ae`, fetched
2026-10-28. The shared merge base is
`efb2073b0e0f723d00e1db6b1700db5f6e597d5a`. Neither input branch was rewritten.

## Feature-level resolutions

- Joud's final frontend, branding, PWA refresh/logout handling, responsive widgets,
  translated loading/error states, unread-summary interface and dedicated Joud
  configuration match her input branch. No whole-file ours/theirs resolution was
  used. Frontend changes were reviewed against the incoming final state.
- Acquisition combines her article schema types, opaque CMS identity checks,
  nested-body handling and index exclusion with Aya's primary-text extraction,
  ProMED discovery, 15 MB HTML bound, original dates, readable format support,
  catalogue/product/video descriptions, public partial abstracts and bounded
  rendered fallback. Explicit source-owned bodies outrank surrounding sharing
  controls. Foreign metadata cannot authorize a different article's body.
- Worker URL comparisons retain HTTPS identity, meaningful query parameters,
  same-paper partial-abstract guards, NEJM's specific attribution alias and the
  combined known tracking-parameter allowlist. Stored URLs and paid request
  identities are not rewritten.
- V3 keeps recoverable superseded snapshots, serialization of feed commits,
  full retained evidence and fixed reporting windows. Joud's prompt version 4
  permits a complete supported headline with an empty body; already-started
  versions 1/2/3 keep their frozen request behavior. Editor/verifier/targeted
  repair/persistence and local-to-original item/source mappings remain intact.
- Publication memory remains the 21-day/16-item selector. Source dates,
  attribution, uncertainty, conditions and reader-interest grounding remain in
  the prompts. Rejected warning-selection and AI notification experiments remain
  evidence only. Push continues to use `redirect: "manual"` and its existing
  headline/count previews.
- Joud's unread summaries are separate from publication and use the shared
  account ledger, durable receipts and provider admission. Existing acquisition
  unlimited-budget support and model reservation/reconciliation safeguards
  remain intact. No live authorization amount was changed during this merge.

## Schema and deployment review

Migration 0069 (creation-relative opt-in scheduling) is unchanged. New migrations
0070 (unread-summary cache) and 0071 (provider recovery indexes) have distinct
numbers with no collision. No previous migration was rewritten. The focused
migration test covers fresh schema construction; already-populated remote
databases were not migrated during integration.

Earlier duplicate migration prefixes already present in the shared history
(0046/0047/0048/0050/0051/0052/0059/0060/0061) retain their distinct filenames;
this merge neither introduced nor renumbered them.

No package manifest or lockfile change was needed. Joud's dedicated resource
bindings remain her own. QA resource configuration is unchanged by this merge.
Staging gains her unread-summary feature flag through the merged configuration;
this file change has not been deployed. GPT-4.1 editing/repair and GPT-4.1-mini
verification routing remain unchanged.

## Validation

Local checks:

- Workspace TypeScript passed; production web build and Worker dry-run build
  passed. The initial sandboxed pnpm invocation failed on dependency symlink
  permissions; the subsequent unrestricted check passed.
- All 90 frontend unit tests, 109 briefing tests and 67 script tests passed.
- Focused Worker suite: 147 tests across 16 files passed, including clean
  migrations, V3 window recovery/frozen prompts, provider accounting/admission,
  article fallback/identity/resources, unread summaries and database errors.
- Connector rerun: 321 passed, one RSS test timed out, one optional private-HTML
  replay skipped. The unchanged RSS case passed in isolation in 4.96 seconds.
  Thus all 322 executable connector cases passed across the rerun and isolated
  check, but the full invocation was not entirely green. An earlier concurrent
  run also timed out a database test, which passed on rerun. No timeout or
  assertion was weakened. Initial semantic parser failures were fixed and their
  publisher regressions passed on rerun.
- Selected Chromium browser suite: 49 passed, covering responsive widgets in
  English/French/Arabic, narrow/enlarged loading states, reader/citation behavior,
  article RTL independent of interface language, settings and unread summaries.
  Representative loading/error screenshots were inspected. This is not a full
  visual comparison of every historical handoff state or every browser.

The full monorepo test command and full Worker suite were not run; Worker
validation was targeted to integration risk. Private command logs and browser
screenshots are in ignored `.local-reports/`. No live provider
test, database migration, deployment or push was performed for the merged branch.
QA acquisition recovery before integration is documented separately in
`remaining-news-acquisition-recovery-2026-10-28.md`; it does not validate the new
merged deployment.

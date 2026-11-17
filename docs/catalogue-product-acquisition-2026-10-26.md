# Catalogue and product-detail acquisition — 26 October 2026

The user authorized support for catalogue/product-detail pages after TechSpot's product page was fetched successfully but rejected as a listing.

## Content handling

- Recognize a primary schema.org Product scope with its own visible heading and substantive description. A related product card beneath another heading is insufficient.
- Recognize page-owned structured product catalogues: CollectionPage metadata must match the requested URL and identify a product ItemList. Ordinary news indexes retain their existing discovery behavior.
- Retain the primary page's visible description, ratings, prices and review attribution. Header content inside the product scope is included; global navigation and executable scripts remain excluded.
- Use the existing shared-contract `LISTING_RESULT` representation and `UNKNOWN` completeness. Optional acquired-result provenance records `PRODUCT_DETAIL` or `CATALOGUE`; no new shared-contract representation or database migration is needed.
- Preserve the exact candidate/source identity, original publication timestamp (if supplied), acquired timestamp and normal immutable evidence promotion. Catalogue evidence cannot silently downgrade an existing richer article revision.
- Website collection, anonymous direct HTTP acquisition and Playwright/Zyte fallback support this classification. No linked review is fetched or presented as a complete review merely because its excerpt appears on the catalogue page.
- V3 receives a representation label explaining that the evidence is a catalogue/listing snapshot and that a page timestamp does not prove a product release or news event date. The retained source body itself is unchanged by this prompt context. Previously frozen V3 inputs remain immutable.
- Authentication, public-URL/identity checks, body limits, payment fences and unlimited aggregate source-collection mode are retained.

## Exact retained example

`https://www.techspot.com/products/pc-games/call-of-duty-modern-warfare-4.330956/`

The existing retained Zyte response contains 178,943 HTML bytes. The new extractor recognizes it as `catalogue / PRODUCT_DETAIL` and extracts 6,184 readable characters. Its publisher canonical matches the original candidate URL. Full HTML/text remain in private benchmark/audit storage; they are not copied into this report. Testing reused the original durable paid operation and response.

## Validation

Six new tests cover primary product extraction, structured catalogue ownership, rejection of unrelated product cards, website collection without child-review fetching, Zyte fallback, and durable listing evidence reaching V3 with labels while the stored body remains unchanged. Together with existing native extraction/fallback checks, 39 focused tests passed. Worker TypeScript checks passed.

Final regression, deployment and recovery results follow below after verification.

## Regression and deployment verification

All 104 existing acquisition/V3 window regression tests passed. Another 34 selected website-provider/discovery tests passed. Together with the 39 focused extraction/fallback/catalogue checks, 177 tests passed. TypeScript and whitespace checks passed.

Deployed to staging as version `5c40f169-fa2d-4288-99fe-87cb03491a76` at `2026-10-26T08:57:44.856766Z`. Existing frontend HTML and resource bindings were verified unchanged. `SOURCE_COLLECTION_BUDGET_MODE=unlimited` remains active. No production replacement, model-routing change or database migration was made.

The original failed TechSpot job received one explicit recovery authorization (`staging-catalogue-support-20261026`) and was dispatched through its existing acquisition queue. Its job/source identities, cumulative attempts and prior failure history were retained. Recovery uses the existing stable Zyte operation identity rather than purchasing another copy of the retained response.

## Live recovery result

The exact previously failed job is now `DONE` (cumulative attempt 5). Both the durable acquisition result and promoted evidence revision retain `LISTING_RESULT / UNKNOWN`, with acquired provenance `PRODUCT_DETAIL` and 6,184 body characters. The result records original publication `2026-10-23T16:46:00.000Z` separately from acquisition `2026-10-26T08:59:16.039Z`. It was recovered through `website_zyte`, using the existing stored response. Prior `UNSUPPORTED` history remains auditable.

This validates acquisition, retention and V3 preparation support. It does not claim the AI-topic feed should select this game listing as relevant, or that it has been published as a briefing item. Selection and novelty remain intelligence responsibilities.

Private proof: `catalogue-live-proof.sql`, `catalogue-live-proof-result.json`, `catalogue-reader-proof.json` and `deploy-catalogue-result.json` in `.local-reports/staging-ai-audit-20261026/`.

The final public-reader check returned TechSpot as `AVAILABLE`: 30 completed acquisitions, zero pending and zero failed. Its previous warning is cleared.

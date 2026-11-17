# Explicit private-feed owner notifications

Private feeds remain excluded from browser notifications unless an operator records the owner's explicit opt-in. This is separate from public visibility: anonymous reads, artwork and Explore eligibility do not change.

An entry in `settings` uses key `browser-push-private-owner:<feed-id>` and JSON value:

```json
{"enabled":true,"ownerAccountId":"the-current-owner-id","enabledFrom":"2026-11-17T19:43:10.767Z"}
```

The owner must match the current feed owner, the publication must be on or after `enabledFrom`, and the subscription must belong to that owner. Invalid or disabled settings fail closed. Without an opt-in, previous private-feed behavior is preserved. This is an operator configuration, not a new public API or automatic opt-in for private feeds.

Private alerts default to the generic localized new-briefing message. If the owner also requests headline previews, the same opt-in can include `"includePreview":true`. This reuses the final published headline without a new model call; it can appear on the device lock screen. Owner, publication cutoff and subscription checks still apply. Only published, verified, ledger-projected editions can notify. Current-subscription receipts and leases still fence acknowledgement and prevent replay. A push-service receipt is not proof that a device displayed the alert.

The click target is the current username-scoped URL of the same feed selected for the preview. It is encoded for Arabic and French names; private routes still require the owner's authenticated session. Existing cross-feed push coalescing is preserved, so when several feeds are pending, the target matches the lead preview rather than the Home page.

The November 17 Joud pipeline test explicitly opts in only its six newly created private test feeds. The owner subsequently requested news in the alert, enabling headline previews for those feeds. Other private feeds and historical approvals are unaffected.

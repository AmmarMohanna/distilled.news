# Explicit private-feed owner notifications

Private feeds remain excluded from browser notifications unless an operator records the owner's explicit opt-in. This is separate from public visibility: anonymous reads, artwork and Explore eligibility do not change.

An entry in `settings` uses key `browser-push-private-owner:<feed-id>` and JSON value:

```json
{"enabled":true,"ownerAccountId":"the-current-owner-id","enabledFrom":"2026-11-17T19:43:10.767Z"}
```

The owner must match the current feed owner, the publication must be on or after `enabledFrom`, and the subscription must belong to that owner. Invalid or disabled settings fail closed. Without an opt-in, previous private-feed behavior is preserved. This is an operator configuration, not a new public API or automatic opt-in for private feeds.

Private alerts always use the generic localized new-briefing message; private headlines and article text do not enter the notification preview. Only published, verified, ledger-projected editions can notify. Current-subscription receipts and leases still fence acknowledgement and prevent replay. A push-service receipt is not proof that a device displayed the alert.

The November 17 Joud pipeline test explicitly opts in only its six newly created private test feeds. Other private feeds and historical approvals are unaffected.

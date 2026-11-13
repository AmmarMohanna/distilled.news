# Durable V3 response recovery implementation plan

Goal: retain complete paid provider responses across transient D1 receipt/settlement failures, then resume the exact operation without another provider request.

Design: checkpoint complete OpenRouter bodies in private R2 using feed, operation ID and immutable intent token, with input and body hashes. Read a checkpoint only for an existing unsettled operation without a saved semantic result. Validate ownership and response structure, then use the ordinary source checks, ledger settlement and canonical result commit. A D1 failure after a successful checkpoint yields the queue execution instead of fabricating UNKNOWN. Existing UNKNOWN records without complete evidence remain fenced. No content/model/monetary limit is added; no model routing changes.

- [x] Reproduce receipt-write failure after paid reply and assert recovery without repayment.
- [x] Implement bound R2 checkpoint helper and recovery hook in semantic operations; integrate V3 transport without letting D1 receipt capture block body consumption.
- [x] Test interrupted settlement, corrupt/cross-intent checkpoints, revocation, duplicate delivery, malformed output and legacy UNKNOWN preservation.
- [x] Run V3/semantic/briefing tests and type/build checks; review final diff.
- [ ] Commit, push, deploy staging, and verify real pipeline progress/publication separately from test results.

Evidence: live final attribution audits returned HTTP 200; one has a confirmed 984-token response billing receipt but no usable semantic result. Live Worker tail records D1 overload errors, including briefing delivery. Historical observability API is forbidden to the existing OAuth credential; native live tail and analytics remain available. This change targets loss between completed response and durable result, rather than assuming all overload causes have disappeared.

Review hardening completed: R2 write fallback, streamed read failures, header correlation on lost bodies, and independent financial recovery including paid unusable output. No review blockers remain.

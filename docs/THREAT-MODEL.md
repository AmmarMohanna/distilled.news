# Threat model

Last reviewed: 29 July 2026

## Assets

- Account identities, password hashes, sessions, recovery and verification tokens.
- Admin authority, Cloudflare credentials, provider keys, and application secrets.
- D1 content and spend ledger, R2 raw payloads, queues, email capability, and routes.
- Public-feed integrity, evidence attribution, availability, and provider budgets.

## Adversaries and trust boundaries

Threats include unauthenticated internet users, abusive accounts, compromised
accounts, malicious source content, hostile publishers, provider compromise,
dependency compromise, leaked operator credentials, and operator mistakes.

Untrusted data crosses the public HTTP boundary, source-provider boundary,
email links, queue serialization, model prompts and outputs, and browser
rendering. Cloudflare account and GitHub release access are privileged
boundaries. Staging is not trusted to share any production resource.

## Primary threats and controls

| Threat | Controls | Residual risk |
| --- | --- | --- |
| Account takeover and enumeration | Password hashing, session versioning, generic auth responses, rate limits, verification, recovery expiry, Turnstile host/action checks | Email compromise and distributed abuse remain possible |
| Pending-signup slot exhaustion | Atomic account/pending caps, 60-minute hosted pending leases, bounded opportunistic and scheduled expiry, per-email and HMAC-IP ceilings, Turnstile, and a documented WAF-compatible route rule | A sufficiently distributed adversary can still create temporary contention; existing login and public reads remain independent |
| Cross-account or admin access | Repository methods scoped by owner, authenticated middleware, admin role checks, API tests | New routes can omit a scope check |
| Public leakage | Public-by-design model, explicit URL structure, no private-feed promise, retention | Users may place private data in public fields |
| Source injection and XSS | Escaped React rendering, external bootstrap assets, strict CSP without `unsafe-inline`, evidence links, content validation | Third-party Turnstile frames and future rendering changes still require review |
| SSRF and unsafe redirects | Public-only global fetch compatibility flag, provider-specific URL validation, bounded redirects | DNS and provider behavior can change |
| Queue replay, duplication, or stuck work | Idempotency keys, leases, attempts, unique indexes, DLQs, window ledger | At-least-once delivery requires continued monitoring |
| Provider/model cost abuse | Fail-closed provider switches, daily/monthly/total caps, reservations and settlement, actor build pins | Provider pricing can change outside the repository |
| Secret or supply-chain compromise | Cloudflare secrets, ignored local files, frozen lockfile, dependency audit, CodeQL, Gitleaks, Dependabot | Third-party actions and packages remain a trust dependency |
| Data loss or destructive migration | Forward migrations, clean and upgrade tests, D1 exports, isolated restore rehearsal | Restore time and Cloudflare regional incidents |
| Staging-to-production mistake | Named environments, distinct IDs/names/routes, confirmation strings, dedicated staging database ID, protected release environment | Direct dashboard changes can bypass repository guards |

## Abuse cases

Registration is closed until canary approval. Provider features are independently
disabled when not needed. Operators should watch registration attempts, account
creation, source refresh rates, budget denials, source failures, queue depth,
DLQs, publication gaps, and unusual public-feed traffic.

## Review triggers

Review this model when adding a provider, new public route, private data,
payments, browser uploads, a new storage product, a new authentication method,
or a material change to Cloudflare bindings or deployment authority.

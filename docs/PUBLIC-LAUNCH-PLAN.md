# Public launch plan

This is the release program for taking Distilled.news from the current closed
legacy production service to a credible open-source public beta. A public
repository, a deployed Worker, or a green test suite alone is not a launch.
Launch requires the product, provider, security, legal, cost, and operating
gates below to pass with retained evidence.

## Launch posture

| Surface | Public-beta posture | Reason |
| --- | --- | --- |
| RSS | Generally available | Lowest cost, publisher-controlled, and easiest to self-host |
| Telegram public channels | Generally available | Useful differentiated source with no paid actor dependency |
| Google News | Four-account paid beta | Proves broader discovery while bounding actor and policy risk |
| X | Four-account paid beta | Impressive source coverage, but paid and operationally less predictable |
| LinkedIn | Disabled | Provider, terms, and reliability risk are not ready for a public promise |
| Generic Apify actors | Disabled | Arbitrary actor behavior is too broad for the hosted trust boundary |
| Brave Search | Disabled | Storage rights and product need are not established |

Published feeds remain public and username-scoped. There is no private-feed
mode, chatbot, or open-ended public question-answering surface.

## Workstream ownership

Each workstream has one accountable reviewer. The same person may implement
across workstreams, but a public release cannot rely on one person approving
their own security-sensitive change.

1. **Product and UI/UX**
   - Own landing, signup, verification, first-feed setup, admin, public feed,
     mobile, accessibility, legal re-consent, errors, and empty states.
   - Require desktop and mobile visual review, keyboard navigation, plain copy,
     and an understandable path from landing page to a useful public feed.
   - Produce launch screenshots and a two-minute demo from the release SHA.

2. **Ingestion and provider quality**
   - Own source validation, timeouts, response bounds, canonical fanout,
     retries, backoff, freshness, attribution, and provider kill switches.
   - Keep paid actors pinned to reviewed builds and prices.
   - Treat recovered upstream transients separately from exhausted failures;
     stale work, current errors, and every DLQ event remain release failures.

3. **Cybersecurity and abuse**
   - Own authentication, authorization, session handling, CSRF, input bounds,
     SSRF controls, secret handling, dependency scanning, CodeQL, gitleaks,
     rate limits, WAF evidence, incident response, and private vulnerability
     reporting.
   - Verify public endpoints for enumeration, cache leakage, username takeover,
     stale aliases, and cross-account data access.
   - Require an independent code owner and protected environment approval.

4. **Data, privacy, and legal**
   - Own retention, deletion, backup/restore, public-content disclosure,
     subprocessors, takedown, acceptable use, terms, privacy notice, and
     conduct reporting.
   - Qualified counsel must approve the real operator/controller identity,
     service address, jurisdiction, and any local disclosures. The repository
     must not guess them.

5. **Platform, release, and recovery**
   - Own isolated Cloudflare resources, forward-only migrations, release
     identity, protected workflows, encrypted backups, rollback baselines,
     queue/DLQ health, observability, and registration controls.
   - Keep production registration closed during transition and observation.

6. **Cost and operations**
   - Own OpenAI and Apify reservations, settlement, daily/monthly caps, paid
     seats, provider health, cost telemetry, and emergency kill switches.
   - Price the canary from enforced call/token bounds, not average responses.

7. **Adversarial release review**
   - Re-run the full pinned release gate, inspect the final diff and live
     controls, challenge false health claims, and issue a written go/no-go.
   - The reviewer must not be the last person to push the release commit.

## Release phases

### 0. Contain legacy production

- Keep all feeds paused and registration independently frozen.
- Preserve the pinned legacy Worker version and live inventory.
- Do not unpause the 71 enabled paid sources under legacy code.
- Keep the production-backup bucket private with its 30-day pre-migration
  lifecycle.

### 1. Bootstrap repository controls

- Merge only the small, owner-audited bootstrap PR containing CI, CodeQL,
  gitleaks, Dependabot, CODEOWNERS, issue forms, and the security policy.
- Record this as the sole bootstrap exception.
- Add a second trusted maintainer, then enable strict `main` protection:
  required current checks, code-owner review, stale-review dismissal,
  last-pusher separation, resolved conversations, linear history, no force
  push/deletion, and no administrator bypass.
- Protect `staging`, `production`, and automated `staging-canary` environments.

### 2. Review the application candidate

- Rebase the full candidate onto protected `main`.
- Open a separate draft PR with user, migration, rollback, security, privacy,
  provider, and cost impact.
- Require the full release gate, CodeQL, gitleaks, dependency audit, and the
  second code-owner review.
- No application deployment is authorized by merging the bootstrap PR.

### 3. Bootstrap isolated staging

- Reuse the existing credentials already held by the operator; do not mint or
  broaden replacement API tokens for this launch.
- Create the staging Worker only through the protected staging workflow.
- Verify that staging D1, R2, queues, DLQs, AI Gateway, OpenAI project, domain,
  secrets, routes, and email are distinct from production.
- Apply all migrations, deploy the exact protected-main SHA, keep registration
  closed, and run remote smoke tests.

### 4. Run the 50-account canary

- Seed exactly 50 verified synthetic accounts, 100 public feeds, 100 live
  connector subscriptions, and 400 same-release controlled fixture
  subscriptions.
- Exercise RSS and Telegram continuously plus one bounded Google News probe and
  one bounded X probe on separate paid-seat accounts.
- Hold one Worker version, release SHA, audit checkout, and workflow SHA for at
  least 24 uninterrupted hours.
- Require:
  - at least 49 signed observations with no gap over 45 minutes;
  - all accounts, feeds, sources, routes, queues, and DLQs readable;
  - current source freshness and zero exhausted, stale, budget, or DLQ failure;
  - bounded recovered-transient rates and zero unrecovered model outcomes;
  - all 100 feeds publishing controlled evidence;
  - at least 95 feeds using model synthesis, with continuous hourly coverage;
  - zero deterministic non-empty editions in the final launch proof;
  - no duplicate messages or unsettled stale spend reservations; and
  - spend within the checked-in, mathematically validated staging plan.
- A critical failure persists in the signed evidence and starts a new 24-hour
  window; it cannot be erased by a later healthy observation.

### 5. Close external launch gates

- Obtain counsel-approved operator/controller, address, governing law, and
  jurisdiction particulars.
- Route `privacy@`, `legal@`, `abuse@`, `security@`, and
  `conduct@distilled.news` to a monitored private destination. Preserve an
  externally sent message and a human reply for every address.
- Verify WAF and registration-rate-limit rules from the Cloudflare dashboard
  or an existing credential that can read them.
- Run the protected exact-SHA public-edge cost workflow and retain its GitHub
  run ID, artifact ID, and artifact digest.
- Verify external receipt of the hosted registration email.
- Record a second maintainer and code-owner approval.

### 6. Transition production while closed

- Dispatch the one-time protected legacy transition only from the attested SHA.
- Install and verify both legacy D1 freeze triggers.
- Export production D1, restore-check it locally, encrypt it, store it in the
  private backup bucket, and retain only non-sensitive evidence.
- Reconcile the reviewed paid cohort, apply forward migrations, deploy the
  hardened Worker, remove reviewed synthetic legacy accounts through their R2
  manifests, run retention, and verify the closed state.
- Capture the first strict rollback baseline with its reviewed D1 repository
  contract. Every later release must execute the exact captured N-1 contract
  against the candidate's full forward schema before remote migration. Do not
  improvise a destructive migration rollback.

### 7. Observe, then open registration separately

- Run production closed for 24 to 48 hours through at least one full
  publication cycle.
- Verify account isolation, source freshness, model/provider health, costs,
  queue age, DLQs, cache behavior, email, deletion, retention, and rollback.
- Run one tightly bounded non-publishing production probe for Google News and X.
- Obtain a separate go/no-go and explicit operator authorization before opening
  registration. Opening registration is not part of the deploy workflow.
- Put only hashes and opaque evidence references into the short-lived,
  release-bound `PUBLIC_LAUNCH_ATTESTATION`; a distinct protected-environment
  reviewer approves its use. No private legal or inbox evidence belongs in the
  repository or workflow inputs.
- Start with a 50-account cap and four paid-provider account seats.

## Public release package

The public announcement is ready only when it includes:

- a tagged, reproducible release and concise architecture diagram;
- a self-hosting quickstart that creates no hidden paid dependency;
- screenshots and a short demo recorded from the released SHA;
- two clearly labelled sample public feeds;
- an honest provider/cost matrix and visible service status;
- security, conduct, contribution, governance, license, privacy, terms,
  acceptable-use, takedown, retention, backup, and incident-response material;
- a changelog and known-limitations section; and
- the signed canary and release evidence summarized without secrets or personal
  data.

## Current go/no-go rule

The code can be release-quality while public registration remains a no-go.
Missing legal identity, untested policy inboxes, unreadable WAF configuration,
an absent second reviewer, an incomplete 24-hour canary, or a missing encrypted
production backup is independently sufficient to block opening registration.

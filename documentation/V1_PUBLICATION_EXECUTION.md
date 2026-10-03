# V1 selection, synthesis and publication

`V1FeedStore`, `scoreAndSelect` and `publishSelection` operate on feed-scoped immutable
evidence, EventVersion and StorylineVersion IDs. D1 validates assessment/candidate/selection
references and retains the complete edition support graph. Source and Feed epochs fence
configuration changes, withdrawal and deletion against publication.

Publication is unique by Feed and publication-window bounds. A leased synthesis job reserves
call, token, cost and wall-clock budgets before a provider request. Drafts and verification
results settle atomically with execution usage; a restart can publish those results without
another paid call. An uncertain provider outcome retains its reservation and needs explicit
operator reconciliation rather than automatic paid retry. A transient persistence failure
without an outstanding provider request is retryable within five attempts.

Only selected stored objects reach the model. Citation validation rejects references outside
the candidate's inspected support. All model-written claims, including exact quotations,
require contextual entailment verification. Unsupported claims are omitted; a nonempty
selection with no supported claims cannot publish. The zero-provider fallback quotes complete
source text of at most 600 characters in the requested language; it neither splits decimals
nor labels untranslated or truncated text as a generated translation.

The optional `createStoredEvidenceModel` adapter reuses the existing bounded AI transport.
`V1_SYNTHESIS_MODEL_ENABLED=true` is required; existing authorized provider configuration is
also required. No flag or deployment setting has been enabled by this commit. Provider-reported
usage is recorded when present; missing charges retain conservative reservations rather than
pretending estimates are confirmed actual charges. Default publication budget: two calls,
12,000 input tokens, 1,500 output tokens, USD 0.10 and 60 seconds. Maximum reserved cost per
configured provider call is USD 0.04. No provider requests occur in the synthetic adapter tests.

Edition insertion, publication status, synthesis completion and notification outbox insertion
commit together. Notification delivery is independent of canonical publication. Editions and
their exact support remain readable after Feed deletion. This module is a tested publication
capability; runtime scheduling, existing product approval synchronization, delivery and a
deployed connector-to-edition proof require the subsequent integration milestone.

# Bounded decision evaluation — 2026-09-28

Starting HEAD: `9a4c878bf43d84065ed11f4a20231fbcff5984a9`.

## Scope and authority

The provider-neutral bounded decision interface selects an existing choice ID.
It cannot supply a URL, selector, JavaScript, credential, shell command, security
decision, timestamp, coverage assertion, or workflow promotion.

`GENERATIVE_ONLY` is the default. `JEV_HYBRID` enables at most five public
micro-decisions before the Browser Use Agent synthesizes discovery hypotheses.
Legal choices are STOP, REOBSERVE, SCROLL, RETURN_TO_LISTING, and
OPEN_OBSERVED_ITEM. The runtime enumerates observed same-origin item targets,
then checks generation, revision, capability expiry, confidence, and the choice
set before executing through the existing network-fenced browser provider.
Authentication and deterministic replay never invoke this experiment.

The Workers AI adapter uses externally configured `typesafe/jev` and the existing
configured Cloudflare AI Gateway. Request state contains only typed page/count
categories. Caller descriptions and additional fields never reach the provider.
Timeout, cancellation, malformed results, low confidence, and provider failures
fall back to the generative path. A stale action is rejected, reobserved, and
handed back to Browser Use. Network rejection remains a hard policy failure.

Durable D1 events record attempt duration, outcome, choice, confidence and token
usage when returned. Execution feedback distinguishes EXECUTED, STALE, STOPPED,
and EXECUTION_FAILED. Completed discovery telemetry derives Jev attempt counts
from server-side event rows rather than proposal claims. No transcripts, secrets,
raw provider errors, or browser content are persisted in this telemetry.

## Controlled production comparison

Both listings use identical SPA insertion behavior and two dated article pages.
Plain HTTP has no listing links. Each request constructs a new production
acquisition service and D1 repository. The two sources have separate resources.

| Metric | Generative baseline | Hybrid configured, provider fallback |
| --- | ---: | ---: |
| Acquisition | SUCCESS, 2 articles | SUCCESS, 2 articles |
| Browser Use discovery runs | 1 | 1 |
| Completed full model requests | 6 | 4 |
| Jev attempts | 0 | 1 |
| Completed Jev choices / executed actions | 0 / 0 | 0 / 0 |
| Generative fallback events | 0 | 1 |
| Runner bridge operations | 11 | 9 |
| Reported discovery operations including verification | 14 | 12 |
| Agent duration | 78,261 ms | 64,270 ms |
| Verification duration | 27,125 ms | See durable run row |
| Discovery through acquisition completion | 134,153 ms | 138,882 ms |
| Entire queued execution | 163,115 ms | 163,816 ms |
| Candidate → VALIDATED → ACTIVE | Passed | Passed |
| Inference cost | Not available | Not available; no Jev usage returned |

These are single bounded observations, not a statistically powered latency
benchmark. The reduction in full model calls cannot be attributed to Jev:
its request failed and no Jev-selected browser action was executed.

Baseline:

- Source suffix: `/listing/jev-baseline-20260928-a`
- Resource: `upstream_936ac522`
- Request: `public_acquisition_request_a6c551166c6e20f4cc4e457b0881bc21`
- Discovery: `public_source_run_1cf411ad192819043bf366909b860c9a_browser_use`
- Workflow: `source_workflow_66e9afc3fb9dc80d3329ba1ecaf43b35`, version 1

Hybrid fallback:

- Source suffix: `/listing/jev-hybrid-20260928-a`
- Resource: `upstream_dffb81c7`
- Request: `public_acquisition_request_a94c9e4ca9289586a06fd8e7f2ad15fd`
- Discovery: `public_source_run_4c2c657fe7933b9e58b604f992ace23c_browser_use`
- Workflow: `source_workflow_c9eff5e0b8a1e73a02e67cf53b886125`, version 1

Both validation records passed source identity, two independently dated articles,
grounded Agent hypothesis, deterministic continuation and read-only origins.
Both returned articles published at 2026-09-24T12:00Z and 2026-09-25T12:00Z,
with independently verified 301-character bodies. Coverage remains partial:
MAX_ITEMS_REACHED, truncated=true, rangeCovered=false. High-water is not advanced.

## Fresh-context replay

New requests after another Worker deployment loaded the existing ACTIVE
workflows from D1 and returned the same two dated articles:

- Baseline: `public_acquisition_request_7b9375ce460e6a54c4f35429013cc974`
- Hybrid: `public_acquisition_request_a8c7188cc972fea3dcff9f68a767ca39`

Both report webOperatorCalls=0. Server-side queries confirmed no new Browser Use
run rows for these resources and no new acquisition Jev events during replay.
Browser Use = 0; full discovery model = 0; Jev = 0. No Python state survives
between requests. Browser contexts are closed by the temporal kernel/ports and
the owning Container is stopped on close.

## Provider limitation and rollout decision

Bounded production Jev attempts consistently failed with Cloudflare inference
code 2021 and a gateway-related failure. Supplying the documented third-argument
gateway configuration did not resolve it. The available Wrangler OAuth session
received HTTP 403 from the AI Gateway management API, so gateway configuration
and provider-side logs could not be inspected through that credential. The
browser-control runtime also failed to initialize; no gateway settings or
billing were changed through the dashboard.

There is no proof of a completed production Jev choice. This is an unavailable
inference path, not an observed successful optimization. Keep GENERATIVE_ONLY
as default and Jev experimental until gateway access is repaired and the same
comparison can be repeated with actual Jev-selected actions. No prepaid credits
or account plan changes were purchased to work around the failure.

Cloudflare references:
[Jev model](https://developers.cloudflare.com/ai/models/typesafe/jev/),
[binding and gateway options](https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/).

## X diagnosis

Resource `upstream_a0015dd6`, `https://x.com/AJEnglish`, still stops at
SESSION_ATTACH:AUTH_SURFACE_TIMEOUT, before Browser Use or Jev.

The trusted diagnostic at 2026-09-28T04:20:57Z shows:

- Top-level `x.com/login`, HTTP 403.
- One document, many DOM nodes, few accessibility nodes.
- Empty visible-text and title categories.
- No identifier/password textbox, form, submit control, iframe, or visible CAPTCHA.
- scriptResponses=0, scriptFailures=0, scriptDenials=0, pageErrors=0.

This is an upstream rejected document, not a selector timing failure or an
incidental script denial. Credential-less structure discovery has no verified
login controls to operate on. No credential injection, challenge bypass,
workflow promotion, or high-water advancement occurred.

The profile remains CHALLENGE_REQUIRED, version 6, with no saved session.
The existing synthetic authenticated X lifecycle and fresh replay remain green.

## Al Jazeera .net

No isolated Jev discovery benchmark was attempted while the provider was
unavailable. The existing production resource `upstream_db88a2ad` and ACTIVE
workflow `source_workflow_1b4aa92db41ed0de43e381abb14d475f`, version 1, remain
unchanged. No .com state or evidence was reused.

## Defects fixed during validation

The original fixture article bodies were below the production trusted-content
minimum. They caused article readiness waits and independent verification
rejection. The fixture now provides substantive bodies; the security/evidence
threshold was preserved and a regression test checks it.

Probe actions also rearmed a 30-second idle lease during bounded Agent runs.
The idle lease is now suspended while discovery is active, while absolute
expiry and cancellation still terminate execution. The regression test proves
both continued discovery lifetime and absolute cleanup.

X diagnostics now preserve only fixed content categories and bounded network/
script counters. A hidden first input no longer prevents visible later login
controls from satisfying readiness. Raw page error messages are discarded.

Migration: `0031_bounded_decision_events.sql`, applied remotely.

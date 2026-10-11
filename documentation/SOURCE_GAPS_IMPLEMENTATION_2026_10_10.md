# Source recovery and fallback follow-up — October 10, 2026

This follow-up implements Telegram edit/deletion transport and strengthens bounded
Google resolution, LinkedIn collection inputs and X fallback verification. It does
not claim that all production-readiness checks or controlled live cases are complete.

## Telegram

The private VPS helper maintains a separate SQLite journal beside the existing
session: `<TELEGRAM_SESSION_PATH>.updates.sqlite3`, with mode `0600`. The session
itself is preserved. Channel PTS and explicit edit/delete event IDs are committed
together. Two bounded difference reads per execution catch up after reconnects.
The first read initializes at the current PTS and cannot recover earlier deletions.

Only Telegram's explicit channel deletion events can produce DELETE observations.
An absent message, empty listing or update-history gap never creates a deletion.
Explicit edit events cause current message reads, including older posts outside the
daily recent-message sample. Normal collection rotates through retained event IDs
in batches capped to the source limit, with at most twice that limit in the saved
snapshot. Extra items use existing durable snapshot pagination. Current messages
supersede older cached delete events; an edit with a missing current message is not
turned into a delete. Changed old posts and deletions do not advance the new-message
cursor. Only resolved deletion receipts establish a remembered delete fingerprint.

The journal retains events after export so a lost response, process restart or another
feed cannot consume them. SQLite serialization protects the PTS boundary; failures
roll back that boundary. A difference-too-long response resets to the returned PTS
and retains a GAP diagnostic, producing partial coverage. Lost update history requires
operator investigation; clearing the GAP must not imply recovery of missing events.
Journal disk growth and backup/retention policy remain operational checks. Do not prune
the journal without considering all feeds using this channel and replay requirements.

Interrupted connections return a retryable failure; subsequent executions reconnect
the same authorized session. Missing/revoked authorization returns AUTH_REQUIRED.
Collection never logs out, deletes a session, joins a channel or starts interactive login.

The implementation follows Telegram's documented
[channel difference protocol](https://core.telegram.org/method/updates.getChannelDifference),
[deletion updates](https://core.telegram.org/constructor/updateDeleteChannelMessages) and
[update-history gap behavior](https://core.telegram.org/api/updates).

Live VPS checks initialized the journal, resumed it as CURRENT on subsequent calls,
collected with the existing session and classified an intentionally missing session
as AUTH_REQUIRED. The final deployed Python SHA-256 is
`4e58367968611eb0689c978235c766408d4b33db53e727f0171fd595ed022821`.
The previous helper is backed up at `backup-source-gaps-20261010` on the VPS.
**Controlled live edits/deletions remain pending:** the user has no owned test channel.

## LinkedIn

Both supported actors now receive `postedLimitDate` when a lower collection date is
requested. Unbounded production polls explicitly use `postedLimit: "any"` and retain
the approved `maxPosts` cap. Independent polling-window identities already existed;
new tests run three overlapping windows through durable paid HTTP and intake, proving
that an old post is accepted once, a newly returned post is accepted on the next run,
and an unchanged third window creates no new observations. Actor starts and continuations
retain their existing budget and uncertain-submission fences.

These actors expose a lower date filter, not an exact historical upper-bound query:
see their [company](https://apify.com/harvestapi/linkedin-company-posts/input-schema) and
[profile](https://apify.com/harvestapi/linkedin-profile-posts/input-schema) schemas.
No unsupported paging or reliable upstream watermark is invented. Busy accounts can
exceed the bounded latest-post sample; complete recall and a controlled genuinely
new live post still require verification. This follow-up incurs no new LinkedIn charges.

## Google News

- Decode the older length-delimited Google article ID format locally.
- Accept a safe HTTPS publisher redirect without following it or fetching its article.
- Preserve the modern public redirect RPC path, accepting only its expected response.
- Probe up to eight unique listing links, with two concurrent probes and at most four
  private decodes. Each private decode has a 16-second budget and a 17-second Worker
  deadline; DNS time counts toward the Python budget. The resolution stage has an
  approximate 46-second upper bound at the Worker port, excluding feed fetch/storage.
- Include canonical URL and publisher identity in durable item fingerprints so a later
  resolved link reaches intake even if listing text is unchanged. Existing fingerprints
  may cause one additional observation per item after upgrade; this is not a new source
  identity or a paid-provider retry. Intake remains the authority for canonical evidence.

Failed, unsafe or changed-protocol results retain the original Google listing and
UNKNOWN content completeness. Synthetic tests cover local decoding, publisher
redirects without publisher fetches, unsafe targets, deadline accounting and updated
publisher metadata reaching intake.

**Fresh live resolution was not successful:** three NASA article checks returned
UNAVAILABLE, and a subsequent Google feed check timed out. Earlier successful live
resolution is recorded in the rollout report, but it does not prove these fresh cases.
The external Google protocol and VPS connectivity remain a live verification gap.

## X automatic fallback

Production collector policy already orders TwitterAPI.io before Apify. New tests use
the actual adapters, durable HTTP/storage and intake for both X profile and search:
a confirmed primary HTTP 503 automatically starts Apify, then its continuation
collects a post; replay causes no additional HTTP dispatch or actor start. No new
fallback implementation or additional paid live submission was needed.

Policy refusal, uncertain paid submissions and exhausted budgets remain terminal;
continuations never switch providers or reinterpret another provider's cursor.
The earlier X report proves each provider live separately. Forced automatic X
fallback is verified with controlled synthetic failures, not a newly forced live outage.

## Verification and rollout

- Full connector suite: **194 passed** across 11 files.
- Python runtime: **15 passed**. Node execution/server: **6 passed**.
- Relevant Worker suites: **35 passed** across three files, serially.
- Connector and Worker typechecks passed. The entire Worker suite was not rerun.
- Private helper installed and checked using the existing authorized VPS session.
- Isolated QA deploy uses the checked-in zero paid limits and empty cron configuration.
  Production, the friend's branch and remote Git branches are unchanged.

Backend implementation commit: `6f895ff`. Final isolated QA Worker deployment:
`eb8994d8-b6b6-43f6-816b-a22f7042ad02`. The post-deployment manual maintenance
check returned HTTP 200. Remote audit confirmed zero enabled sources, zero enabled
intake scopes and all five paid-provider budget limits at zero. Reserved spend did
not increase. No D1 migration or shared contract change was introduced.

The remaining controlled live cases are verification gates, not evidence of a local
test pass. No additional paid provider calls were made during this implementation.

# Joud live briefing user-flow investigation — October 23, 2026

Target: `distilled-news-joud`, dedicated Joud D1/R2/queues. No QA resources reused.

## Reproduced blockers and fixes

- The source/briefing queue integration and full-article preference were missing.
  The dedicated queues are deployed; remote migrations were already current.
- Recommendation discovery stopped replacement after two accepted publishers and
  collapsed distinct social accounts by platform host. Discovery now targets a
  broader verified set and distinguishes social source identities.
- Current-news discovery lacked today's date and proposed retrospective articles.
  The prompt now anchors the date and requests ongoing monitoring sources.
- A model answer containing more than 15 candidates failed the whole request.
  Parsing now accepts a bounded larger response and checks up to 30 entries, returning up to 20 distinct verified choices.
- The optional verification argument was passed as a fifth `undefined` argument,
  reproducing the five documented baseline recovery mock failures. It is now
  omitted when no verification scope exists; those recovery tests pass.
- A retained OpenRouter request was cancelled, but accounting recovery rejected
  its exact catalog canonical model alias and nullable finish reason. Recovery
  now recognizes the two verified GPT-4.1 aliases and explicit boolean cancellation.
  Generation identity, provider-reported cost, receipt binding and UNKNOWN result
  remain checked/preserved. The exact operation was settled at $0.007682 from
  provider metadata; no inference was repeated.
- Analytics Vidhya articles use `div.content-box#article-start`, without `<article>`
  or `<main>`. Extraction now supports an unambiguous metadata-backed article body.
  The actual public article yielded 17,883 characters and its original publication
  date. Ten test-feed extraction failures were retried with attempts retained and
  prior states recorded in `source_acquisition_recoveries`.
- V3 semantic lease contention consumed briefing draft attempts and could make a
  request terminal after five collisions. Lease/contention errors now propagate
  without consuming attempts. A regression survives six collisions and publishes
  after release. The existing AI Industry Watch request was resumed under its
  original frozen 55-article input, attempts and operation identities, with audit.

## Live test and constraints

The user explicitly approved a public `Technology Briefing Check` feed with four
accepted recommendations (CNET, ZDNET, MIT Technology Review, Analytics Vidhya), a
30-minute schedule, and pausing after its first visible published briefing.
Feed ID: `briefing_user_flow_20261023`.
Reader: `/admin/technology-briefing-check/`.
Creation: October 23 around 15:09 Beirut. First complete scheduled interval ends
at 16:00 Beirut. Feed creation times, fixed window admission, original publication
metadata and pre-subscription backlog filtering have not been backdated/bypassed.
All four publishers have acquired article evidence. The fresh-feed test completed successfully: its 15:30?16:00 Beirut window
published at 16:00:52 with one newly published source article, two successful
editor/verifier calls, zero failed briefing attempts, and $0.01154 reported model
cost. The public reader exposed the edition and the approved test feed was paused
at 16:01:40. Two exhausted acquisition jobs remain honestly recorded in partial
coverage; they were not relabeled successful or deleted. Separately, the recovered AI Industry Watch request
published 12 source-cited sections at 15:47:48 Beirut, verified through the public
reader API and the retained V3 result.
The ignored local monitor confirmed the public edition, paused this exact feed,
recorded the pause response, and exited successfully.

The user approved increasing concurrency from one to two while keeping the $1
ceiling. An audited amendment was applied. Subsequent retained background work
reached about $0.97 exposure; the user then explicitly approved a $5 total ceiling. The audited exposure
amendment was applied with the original expiry and all liabilities retained.
The authorization expires October 23 at 20:41 Beirut; no expiry renewal occurred.

## Validation and artifacts

- 57 focused source assessment/discovery/recovery/flow tests pass.
- 49 acquisition/readability/native-extraction tests pass.
- 19 provider-recovery tests pass, including mismatched identity and incomplete
  cancellation evidence retaining holds.
- 41 V3/window/runtime/source-integration tests pass, including the new contention
  regression and existing replay, revocation and stale-publication protections.
- Worker and connector TypeScript checks pass; frontend production build passes.
- Local live reports and monitor: `.local-reports/briefing-user-flow/` (ignored).
  They contain operational evidence and must not be published wholesale.

Both the existing AI feed and fresh test feed were confirmed in the public reader.
Retained verifier results and cited passages were reviewed; this is source-grounded
validation, not a guarantee that every publisher claim is true. The new briefing
retains the original article timestamp and exact supporting source URL.


Publication dispatch also had a starvation bug: any historical send attempt
excluded a request from priority forever, including declined transport sends.
Priority now respects active lease/backoff times rather than lifetime send count.
Three real-D1 regressions cover declined sends, expired deliveries, live-delivery
deduplication and retained retry deadlines. The deployed guest header has exact
matching login-control coordinates at 1280x800, 390x844, 667x375 and 1920x1080.


Final Worker deployment: `a26b815a-4a37-4039-a160-e694453fb80e`.
The existing AI briefing used two settled model calls ($0.03178) and contains 12
cited sections. Its browser reader rendered without JavaScript errors.
The four-source fresh-feed test passed the normal recommendation, owner approval,
collection, full-article acquisition, fixed-window scheduler, editor, verifier,
persistence and public-reader path. This live test used publisher RSS; it does
not establish live success for every social-provider configuration.


The new briefing was also rendered in Chromium without JavaScript errors. Its
Sources dialog loaded the retained supporting article, original publication time
(15:32 Beirut), and exact ZDNET URL. The source-link assertion waits for dialog
content to load rather than probing visibility before the response arrives.


## Follow-up repairs: October 23 evening

The CNET (604 KB HTML) and ZDNET (783 KB HTML) jobs exceeded a 512 KB fetch cap.
Article transport now permits 2 MB while retaining a separate article-text limit.
Oversized responses are classified instead of exhausting crash retries. Nested
related-story article tags could also donate an unrelated excerpt from a long
article; those documents now use DOM extraction with the declared primary body.
Both exact jobs were recovered from real article text (20,438 and 43,669 characters)
using ordinary evidence validation and one audited additional repair attempt.
Prior failures remain recorded. Temporary maintenance scopes were restored and
the test feed stays paused. The public reader reports failed=0 for all four sources.
Conflicting original publication dates remain unresolved and are not presented as fresh.

Recommendations now stream checked choices, with topic-matched catalog checks in
parallel with discovery. Discovery considers up to 30 candidates and targets 20
choices interleaved across available channels. A live technology check returned
its first choice at 3.756 seconds, 15 choices at 10.283 seconds and 18 overall.
This does not guarantee a complete list in five seconds or twenty relevant choices
for every topic. Focused social discovery and larger bounded reads followed that test.
Fresh checked suggestions can be selected without repeating the same check for
five minutes and the same interest context; server save checks remain. Technical
verification status and rejected-candidate diagnostics are hidden in recommendation
UI; actual add failures remain visible. Public reads cap at 2 MB and request-local
recommendation evidence reuse retains at most 16 MB. Unsafe destinations stay blocked.

Google News tries native RSS before configured paid fallback. X, LinkedIn and Google
News passed authenticated live checks. Telegram also passed authenticated collection and relevance checks using its official public channel. The earlier durov test link was unavailable; it was incorrectly diagnosed as a runtime failure.
The user explicitly approved a recurring $10/day collector cap, replacing $5/day.
Existing reservations remain; the separate briefing-model grant was not renewed.

A saved blank JPEG caused the AI Industry Watch spinner. The exact image was
replaced using the existing model and prompt with seed 43, visually inspected before
upload. Its original bytes remain in ignored local evidence. The browser confirms
that the replacement loads. Compact cards place timestamps below usernames and
Live/Paused on the trailing side. Votes and menus have fixed slots. English,
French and Arabic browser checks at 1920/1280/390 widths, including compact heights,
confirm aligned action insets, contained menus and no horizontal overflow.


Final mixed-channel check before Telegram seeding: first choice in 3.291 seconds,
15 choices in 8.067 seconds, 20 choices in 23.071 seconds; total completion 33.429
seconds. The 20 choices included RSS, X and LinkedIn. Google News separately passed
live checks. Telegram official public-channel posts and relevance passed in 4.689
seconds. Public channel candidates and Google News now start alongside the RSS
catalog. A native Google timeout can use the configured paid fallback, preserving
reservations. Already checked selections can be saved while remaining suggestions
arrive. Full lists are not promised in five seconds.

The Joud VPS services and Cloudflare Tunnel were healthy. Direct diagnostics
confirmed public-channel identity and five readable posts. The durov link returned
UNAVAILABLE rather than an authenticated public Channel; that error is now classified
as a channel issue, not a service outage. No service restart, Telegram login or
session replacement was required. Temporary SSH access was used for diagnostics.


Final deployed validation: internal authenticated recommendation endpoint returned
20 checked sources in 32.056 seconds: 11 RSS feeds, four X accounts, three LinkedIn
pages, one Telegram channel (t.me/telegram), and one Google News search. The normal
user recommendation quota was not consumed by this final diagnostic. Native website
article extraction was independently proved by both recovered CNET/ZDNET jobs.
The full mixed list is not a five-second response; early streamed choices were
measured separately at about 3.3 seconds. Checks remain internal to the normal UI.

The temporary root SSH public key was removed after diagnostics, preserving other
keys. A follow-up login with that key was denied. Both local private-key copies and
the generated public-key file were deleted. No new Telegram login, service restart
or account session replacement occurred. Deployment version:
d591e7be-6f2c-4666-8ac1-25bb5855bba1.

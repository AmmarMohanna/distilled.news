# X integration testing scope

Reviewed 2026-09-26 at the user's request to test lawfully. This is a conservative implementation scope, not a legal opinion or an assurance of platform-wide compliance.

## Sources and distinction

- [Developer Agreement](https://docs.x.com/developer-terms/agreement), III(C): API performance information is restricted to internal, non-commercial purposes and treated as confidential.
- [Developer Policy](https://docs.x.com/developer-terms/policy), “X performance benchmarking”: prohibits measuring X availability, performance, functionality or usage for benchmarking, competitive or commercial purposes.
- The same policy requires stored content to follow deletions/changes and imposes public-display requirements. An approved developer account does not by itself establish approval for LLM summaries, redistribution or a comparative study.

## Work performed

Ran the three existing synthetic X normalization regression cases on the VPS: all passed. These exercise our code's long-text/link preservation and handling of absent media expansions. Media remains outside campaign acceptance. No X requests, content downloads or additional provider charges were made for this check. These are software regression results, not X service-performance measurements.

Local execution prerequisites were unavailable: system Python lacks pytest and the pnpm shim has no selected Node version. The VPS Python environment completed the normalization tests. The worker ingestion suite was not rerun successfully this turn.

## Boundary for the next live work

Keep ordinary internal integration checks separate from the acquisition-provider comparison. Do not relabel the proposed 100-post comparative cohort as functional testing while retaining its comparative purpose. Expanded comparative collection remains pending written clarification from X. Do not publish API performance findings or raw response datasets. Retain the existing $25 total budget; no new allocation or charge was introduced.

Before public deployment, review attribution/display, permitted transformations and LLM processing, retention/deletion propagation, and the approved application description. No production deployment is authorized by this note.

## Ready-to-send clarification request (not sent)

We are developing Distilled.news, a university public news-briefing project. We want to use the official X API for selected public posts. Can you confirm the permitted scope for internal integration testing of our own text/metadata normalization, duplicate handling and edit/deletion handling? Separately, may we include the official API in an academic comparison of acquisition providers using up to 100 posts, and share findings with our professor or publish them? We also request clarification on retaining post text and metadata, displaying attributed excerpts and source links, and sending content to an LLM for inference-only summaries (not model training). Please identify any required written approval, access plan, retention limits and display restrictions. We will not run the comparative study or deploy those content uses on the assumption that ordinary API access authorizes them.

## Updated user scope

The user excluded the official X API from benchmarking. Planned alternative comparison: Apify versus TwitterAPI.io, retaining the 6-profile/4-search, ten-items-per-target sample. No official API calls or reference collection should be made for this comparison. Alternative access authorization remains unresolved: TwitterAPI.io AUP sections 1 and 2(c) require compliance with X rules and prohibit scraping/storage/redistribution that violates X terms. This does not establish that every alternative use is prohibited, but the available evidence does not establish clearance for this study. No new live requests were made for this scope update.

Source checked: https://twitterapi.io/acceptable-use . Obtain provider-specific written details about authorized acquisition and permission for the proposed academic comparison; a subscription alone is insufficient evidence.

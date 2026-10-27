# OpenAI acquisition isolation — 2026-10-27

## Cause

The public OpenAI RSS endpoint responds successfully, but anonymous article requests encounter HTTP 403. The existing HTTP → anonymous Playwright → durable Zyte chain therefore matters. One Zyte article operation lost its response. The source-wide unknown-payment fence blocked unrelated article requests, although their URLs and stateless extraction bodies were independent.

## Change

Narrow only proven anonymous, stateless Zyte HTTP extraction requests to an exact normalized target fence. Recognized request bodies contain only `url`, `httpResponseBody: true`, and `httpResponseHeaders: true`, sent by POST to the exact Zyte extraction endpoint. Record the target alongside the durable claim and retain it on transport/body failure.

A different target may proceed past an expired or failed stateless claim. Active claims still serialize in the same atomic reservation transaction. The same URL remains fenced across new job IDs and trailing-slash variants. Unknown historical request shapes, sessions, browser actions, other providers and unattributed legacy operations retain the existing broader fence. All reservations, caps, immutable operation IDs and original unknown outcomes remain intact.

The historical QA operation's request shape can be annotated only after reproducing and matching its stored request hash. This is request-provenance evidence, **not** provider completion evidence. Its status, missing payload and $0.05 reservation are preserved. Do not label it settled or retry it without provider evidence.

## Verification

Focused checks and live QA results are recorded below. No production or staging deployment is included.

## QA outcome

Deployed code commits `1588132` and `7491b76` on `aya-ghada-integration`. Active QA version: `444264d7-205a-401e-9f65-17e8126236bf` (October 27, 16:42:17 UTC). Existing resource/variable/secret bindings were preserved and the public homepage/feed API returned HTTP 200. Production and staging were not changed.

Validation passed: 105 connector regressions, 25 financial/concurrency tests, and 17 focused operator-recovery tests (147 tests total), Worker TypeScript and the QA dry-run build. The first sandbox test attempt could not connect to its local Miniflare service (`EACCES 127.0.0.1`); rerunning with the required local-service access passed. Skipped tests are not counted as passed.

The historical operation's exact request body was reconstructed and matched to its stored SHA-256 request hash before annotating its normalized stateless target. Its unknown status, missing payload and $0.05 conservative reservation remain intact. No provider completion was fabricated and no repeat of the uncertain DevDay request was dispatched.

All eleven eligible old cache failures received one additional attempt through the normal recovery authorization, preserving cumulative attempts and prior failures. Four had reached DONE at the final snapshot; the rest remained queued. No new source snapshot was forced.

The OpenAI source advanced from zero acquired articles to **67 DONE acquisition jobs** at the final snapshot. Retained acquired records explicitly name `website_zyte` as the provider, preserve original publication dates, and mark completeness UNKNOWN. A preceding text check verified bodies from 680 to 11,842 characters; successful acquisition is not proof of factual briefing quality. A substantial historical backlog remains queued, so this is recovery in progress, not completion of every article or publication of the AI briefing.

Three separate exceptions were inspected from already-retained provider responses, without a new paid request:

| URL | Observed result |
|---|---|
| `https://openai.com/academy/prompting` | Redirects to `https://learn.chatgpt.com/docs/prompting`; readable text exists, but the existing exact-candidate identity check refuses a different origin. Redirect support remains unresolved. |
| `https://openai.com/index/gpt-5-coding-design` | HTTP 200; only 87 extracted characters from a video/demo page, insufficient for an article. |
| `https://openai.com/business/learn/connect-internal-knowledge-from-google-drive` | HTTP 200; only 163 extracted characters from a demo description, insufficient for an article. |

These exceptions and the original uncertain DevDay operation may keep a source warning visible. They no longer stop unrelated OpenAI article acquisition. The original unknown operation was the only unresolved provider row in the final snapshot.

Private operational receipts and full publisher responses remain under the ignored `.local-reports/aya-ghada-qa-deploy/` directory; no full article text or credentials were added to Git.


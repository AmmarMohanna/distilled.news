# Verified public article redirects

The article fallback accepts a changed final URL only after independently observing a bounded public HTTP redirect chain from the admitted discovery URL to that destination. A provider's final URL or canonical tag alone is insufficient. Each hop uses anonymous HTTPS, manual redirects and existing public-network guards; credentials, login destinations, loops, unsafe hosts and unverified destinations are rejected. The verification deadline is 60 seconds and at most five redirects are accepted.

The original candidate, observation and durable paid-operation identities remain stable. Acquired content retains the original canonical discovery URL plus the actual `resolvedUrl` and `provenance.redirectEvidence` chain. Extraction uses the destination page's HTML, canonical identity, title and date metadata. The original feed timestamp is not substituted for a missing date on the destination page. This does not claim that a replacement landing page is the original form or article. The destination must still pass readable-text, primary-content, access and canonical checks.

Two retained OpenAI failure cases motivated the change:

- The Campus Network student-club interest form redirects through a trailing-slash URL (308), then to `/student-collective/` (307). Its saved final page contains 3,436 extracted characters and is titled `OpenAI Student Collective`.
- `/academy/prompting` redirects through a trailing-slash URL (308), then to `https://learn.chatgpt.com/docs/prompting` (307). Its saved final page contains 19,454 extracted characters and is titled `Prompting`.

Both chains were verified using anonymous HTTP on 29 October 2026. Existing saved Zyte responses were integrity-checked; no paid scrape was needed to inspect them. Their original `FALLBACK_URL_MISMATCH` jobs can receive one explicit operator recovery authorization carrying the verified chain. The normal pipeline revalidates the redirect before accepting the retained response, preserves the failure history and enforces existing payment fences.

Validation covers unsafe and login destinations, loops, missing redirect proof, a different observed target, exact recovery identity, persistence of redirect provenance, and omission of the original publication date when the final page is undated. The 35 article-fallback tests, six redirect tests and four selected acquisition recovery/persistence tests passed, as did worker TypeScript and the production dry-run build.

For explicit recovery, a recent operator-verified redirect chain stored in that exact job's recovery authorization may be used if the Worker cannot independently re-observe it. This evidence is valid only within the authorized attempt bound and 24 hours of approval, and must match the requested URL, returned URL and public redirect chain. It does not authorize arbitrary provider destinations. The extra fallback test covers expired approval and exhausted attempt rejection; 36 fallback tests and six redirect tests passed after this correction.

The explicit redirect-recovery route also checks whether the exact original Zyte operation already has a retained successful response. If so, it decodes that immutable response before invoking a new browser helper. The check uses the original operation hash and source scope, retains authorization checks, and does not admit a new paid operation. This avoids unrelated helper-capacity waits when all required response bytes are already stored. The additional regression brings the focused total to 37 fallback tests and six redirect tests.

The recovery router selects the exact retained fallback before its earlier anonymous HTTP helper probe as well. This prevents helper admission from blocking saved-content recovery before it reaches the fallback. The persistence regression explicitly fails if that unnecessary helper probe is invoked.

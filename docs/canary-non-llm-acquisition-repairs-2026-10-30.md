# Canary acquisition repairs without an LLM

The October 30 sources-QA audit retained 278 failed acquisition jobs across 20
canary feeds and 100 configured sources. Login and paywall cases were explicitly
excluded from this follow-up at Aya's request. No LLM fallback was added.

## Confirmed defects and changes

### Stable UEFA article identities

Four anonymously fetched UEFA pages returned HTTP 200 with a different canonical
headline slug but the identical complete CMS article ID. Exact-path comparison
rejected those pages as different articles. Comparison now recognizes that
publisher's full four-part hexadecimal ID, while retaining the HTTPS origin,
competition and meaningful query parameters. Other publishers and different IDs
remain distinct. Stored URLs, observation identities and paid operation keys
are not rewritten.

A subsequent live case confirmed that UEFA's aggregate `news-media` section and
a competition section expose the same complete article ID. This specific section
alias is accepted. Arbitrary different competition paths and different IDs are
still rejected.

The existing explicit unpaid-recovery endpoint can now reopen this particular
canonical failure when exact safe alias evidence is supplied. It retains prior
failure history and permits one additional unpaid attempt. It does not clear
unresolved charges or automatically reopen arbitrary identity failures.

### Visible article bodies versus structured teasers

UEFA's JSON-LD `articleBody` contained a short summary while its visible
`article_body` container held the reporting. Extraction preferred that summary.
It now recognizes this explicit body class. A unique visible body with at least
two substantive paragraphs and 400 characters takes precedence over a structured
teaser of at most 300 characters when it is more than twice as long. Ambiguous
bodies and unrelated navigation do not replace structured text, and substantive
structured articles retain their existing behavior.

The four retained public samples changed from 116/78/149/136 extracted characters
to 1,820/5,034/6,136/4,124 characters respectively. Publication metadata remained
unchanged. Full page snapshots remain in ignored private local evidence, not this
repository. These are extraction measurements, not factual-quality annotations.

### Repeated Google resolution work

The live backlog contained multiple pending jobs for identical Google News URLs,
including ten jobs for one link. Acquisition previously requested a helper
execution slot before it could reuse the helper's own cached resolution.

Verified anonymous listing-to-publisher resolutions now reuse the existing
durable public cache with a separate content-type namespace and a one-hour
maximum lifetime. The existing public HTTP cache keeps its one-minute default.
A durable lease prevents concurrent isolates from duplicating the same decode.
An in-flight decode produces resource backpressure rather than a transport
failure. Missing/invalid results are not cached. Source authorization is checked
on every use, and targets must pass the existing public HTTPS URL policy.

Only the public URL mapping is reused. Article evidence, private source state,
paid responses, checkpoints and source ownership are not shared by this change.
Existing cache retention handles the immutable R2 generations; no migration or
new resource binding is required.

### ESA archive navigation

ESA archive pagination such as `/Science_Exploration/Space_Science/(archive)/0`
had been queued as an article and failed primary-text extraction. It is now
recognized as a host-scoped section locator and excluded from discovered article
links. This does not turn a listing into article evidence or remove historical
jobs.

## Validation and limits

Local validation passed 109 connector tests (one existing skip), 75 focused
Worker tests, and seven canonical-recovery/resource-wait integration tests.
Worker TypeScript checks and the sources-QA dry-run build are recorded separately
from live recovery results. Early failures in the new recovery test were fixture
errors: immutable inputs must be created through intake with matching proposal
URLs rather than edited. The final fixture uses that real intake path.

The sampled VPS helper completed work and its Worker slot leases changed and
released; a permanently stuck slot was not established. Reuse reduces redundant
Google work but is not proof of sustained throughput or a drained backlog.
Provider rate limits, inaccessible pages, genuinely missing text, unknown paid
outcomes and the existing backlog remain separate operational concerns.

## Live QA validation, October 31

Code commit `83b37313` is deployed at 100% on sources-QA as version
`15a418d2-6d65-4011-9b24-3b8665f50fb2`. Resource bindings and the existing
financial authorizations were preserved. No production or staging deployment
was changed.

At 09:19 UTC, all 14 inspected UEFA canonical failures were independently read
back as DONE with retained bodies of 1,820–6,136 characters. Each has an explicit
unpaid-only recovery authorization, cumulative attempts and prior failure history.
Completeness remains UNKNOWN where the existing acquisition policy cannot prove
it. The aggregate-section cases required the alias follow-up and a separately
guarded additional unpaid attempt; existing approval IDs were reused for busy
admission retries rather than granting extra attempts on every operator retry.

Two live cache mappings were replayed through the resolver with helper execution
disabled: both returned the same mapping, with zero helper calls. The later
cache snapshot contained 160 unexpired mappings. This confirms reuse, not an
end-to-end throughput guarantee.

The 09:18 UTC canary snapshot still contained 10,082 pending acquisitions,
12,134 DONE, 454 FAILED, 4,802 deferred initial-backlog jobs and 20 running.
Continued collection had outpaced processing; the workload is not fully
recovered. All nine original Apify read holds had retained receipts, while
four unknown actor starts and 21 original Zyte outcomes remained fenced.
These observations do not authorize clearing uncertain charges, increasing
spending, changing feed frequencies or claiming 1,000-feed scalability.

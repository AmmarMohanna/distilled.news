# SpaceX source repair — 2026-10-10

Changes are on `backend-sources-fixes`. QA Worker version:
`0685d080-3d1a-4d90-8872-cc0111d39063`.
The VPS helper SHA-256 is
`2c04e2f76c3fb1548749afa8171fb021f911cb7f60a62eb1894336d92735297c`.
No production deployment or Git push was performed.

## Corrected behavior

- Telegram bootstrap reads a bounded recent lookback and selects textual posts
  and captions. SpaceXFeed messages 20388–20390 were captionless photos in the
  same album; the actual caption was on 20387. The deployed helper now returns
  recent textual messages 20385, 20386 and 20387. Historical recall remains
  partial. Media contents are not invented or treated as extracted text.
- QA probes synchronize product-backed scope revision before freezing the
  collection request. The saved X run used revision 8 while the feed advanced to
  revision 10; ordinary probes under the newer revision started a different run
  and hit the zero paid budget instead of replaying the older saved batch.
- A token-protected QA recovery path re-evaluates immutable saved batches under
  current approval and current intake restrictions. Source identity, scope,
  provider, bounds and limit must still match. It preserves original handoff and
  observation identities, never calls a provider, and never advances a cursor.
  Production scheduler revision checks remain in place.
- An authorized private Google route now receives control after one public
  attempt with a five-second bound. Existing refusal behavior for rate limits,
  policy and authorization errors remains unchanged. Saved link updates can be
  replayed after a client timeout without fetching another snapshot.
- QA diagnostics expose only approved internal error codes. Arbitrary exception
  text, tokens and provider responses are not returned.
- `POST /_qa/drain-feed` uses the existing bounded acquisition/intelligence queue
  relay for one currently approved feed. It does not collect source snapshots.

## Live QA results

Test feed: `SpaceX Starship tests and NASA crew/cargo missions.`

| Source | Result |
| --- | --- |
| Telegram / SpaceXFeed | Three textual posts accepted, including the album caption |
| X / SpaceX | All 20 saved posts accepted through guarded recovery |
| NASA RSS | Ten items accepted; ingestion is broader than the feed topic |
| Google News | All 30 original listings now have accepted publisher URLs |

The Google query remains exactly `SpaceX (Starship OR Dragon OR launch)`.
Listings still have `LISTING_RESULT` / `UNKNOWN` content completeness: resolving
a link does not prove full publisher article extraction or topical relevance.
A subsequent Google pass completed HTTP 200 in 86.535 seconds, with zero new
observations/proposals for the unchanged first slice. This is one live check,
not a sustained latency benchmark or proof that all future Google links resolve.

Paid operation totals stayed unchanged throughout this repair: TwitterAPI.io 12,
X Apify 15, LinkedIn Apify 15, Zyte 4. Provider limits remain zero. No additional
paid provider operation was submitted.

## Publication and remaining work

The feed uses a daily 08:00 `Asia/Beirut` schedule. Its completed quiet request
covered October 9 08:00 through October 10 08:00; the feed itself was created
October 10 at 19:06 Beirut time. That request predates the collected evidence.
It is not proof of a failed publication and not proof of successful publication.
There is still no published edition for this feed.

QA automatic polling remains disabled (`crons = []`). Twelve bounded manual
downstream relay passes made progress but did not drain all pending work. The
snapshot below is a point-in-time result; queued workers may continue processing.

| Job kind | State | Count |
| --- | --- | --- |
| ACQUIRE | DONE | 34 |
| ACQUIRE | PENDING | 45 |
| REASSESS | DONE | 9 |
| REASSESS | PENDING | 22 |
| REASSESS | PENDING | 2 |

Slow queue work and transient contention still need investigation and a complete
drain/publication check. Do not call this sustained operation or a full frontend
to published-briefing pass. Telegram controlled edit/deletion coverage and broad
production source coverage are outside this narrow repair verification.

## Validation

- Python source helper: 19 tests passed.
- Connector suite: 198 tests passed; the affected 62 provider runtime tests were
  rerun after the final Google timing change and passed.
- Worker QA/recovery tests: 25 passed.
- Worker connector/downstream/product scope tests: 33 passed.
- Final Worker typecheck passed; QA Worker deployed successfully.
- Git whitespace check passed. The full Worker suite was not rerun.

## QA recovery parameters

Existing maintenance-token authentication is required. Never paste that token
in documentation, source files or chat.

`POST /_qa/collect-provider` retains `sourceId`, `providerId` and `probeId`.
Optional `replayBatchKey` must be the existing 64-character hexadecimal handoff
key. It cannot be combined with recheck keys or nonzero page/snapshot offsets.
For Telegram, `recheckItemKeys` is bounded by the approved limit, unique and
restricted to the approved numeric channel identity. Rechecks do not advance
the new-message cursor.

`POST /_qa/drain-feed` accepts `{ "feedId": "approved-feed-id" }`. It selects
enabled connector-owned sources of that feed, intersects them with the current
runtime allowlist, and uses the ordinary queue relay. Repeated rapid calls can
send duplicate queue deliveries; ordinary job leases/idempotency still apply.

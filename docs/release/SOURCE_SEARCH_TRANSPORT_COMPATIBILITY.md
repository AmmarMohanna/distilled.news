# Source search transport compatibility

Source discovery combines publisher RSS, public web/news indexes and the configured Google News route. Index entries are candidates: the feed's title, interests and query still pass the relevance model, followed by actual anonymous readability checks. No paid article retrieval is added by these changes.

The frontend accepts streamed verified matches while slower checks continue. A short owner-scoped cache entry makes already displayed evidence available to source selection before the final stream response. Progress writes are serialized; late responses from an older query cannot update the editor. JSON clients remain supported.

Direct article checks overlap Google resolution under the same bounded verification deadline. Native article checks queue behind the helper's two transport slots. Google index reads, Google resolution and anonymous RSS fallback also use this shared admission path. Only a refusal before an external request is submitted may wait for capacity; submitted failures are not blindly retried.

The Worker and all three VPS components must support `public_feed`:

- `scripts/source-execution-server.mjs`: authenticated operation whitelist.
- `scripts/source-execution.mjs`: child-execution whitelist.
- `scripts/source-execution.py`: dispatcher and `fetch_public_feed`.

An older helper can otherwise return HTTP 400 immediately even though Worker unit tests pass. Deploying only the Worker does not upgrade these files. Verify the actual target helper; preserve unrelated local changes, back up changed files and validate the service after its update. The anonymous RSS operation accepts bounded HTTPS input, rejects credentials/private addresses and does not follow redirects.

The free news index's explicit article redirect carries a publisher URL. Search decodes that identity without requesting the index's tracking wrapper, rejects unsafe destinations and applies the normal article checks to the publisher URL. Index availability is not a guarantee that all publishers are freely readable.

Local tests, full CI, live discovery, actual publication and push-service/device delivery are separate evidence. In particular, an empty news window, an off-topic result and a transport timeout must not be reported as the same outcome.

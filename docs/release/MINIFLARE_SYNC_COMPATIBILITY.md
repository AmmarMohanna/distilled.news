# Miniflare synchronous-response compatibility patch

The pinned `miniflare@4.20260611.0` uses a shared zero/one notification flag for
synchronous D1 proxy requests. Under scheduling contention, an earlier reply can
notify after the next request starts waiting. That request can wake before its
message exists, failing `assert(message?.id === id)` and desynchronizing the proxy.
This occurred in the PR's private-notification integration setup on GitHub CI.

The pnpm patch applies the request-generation synchronization used by
[Cloudflare's upstream implementation](https://github.com/cloudflare/workers-sdk/blob/main/packages/miniflare/src/plugins/core/proxy/fetch-sync.ts).
Each worker reply publishes `(id + 1) | 0`; the host waits until that specific
generation appears before receiving its message. The message identity assertion
and errors remain intact. No test retries, relaxed assertions, application
changes, dependency version upgrades, or deployed resource changes are involved.

`scripts/miniflare-sync.test.mjs` exercises the installed host and worker code
with an isolated fake HTTP transport. A deterministic stale notification fails
the former synchronization logic and passes the patched logic. It makes no
network or model calls. The normal CI script suite runs these checks before the
full worker suite. Frozen pnpm installs apply the tracked patch and lockfile.

When upgrading Miniflare to a version containing this upstream fix, remove the
patch and adapt or remove the version-specific compatibility regression together.

# Feed-session review fixes

Branch: integration/beta-ui-extraction; base d321d845.

- Successful feed-page logout aborts the active read, invalidates pending read/search work, clears loaded editions, detail/report selection, account/editor state and feedback, and replaces the current history entry with Home. Logout failure keeps the reader intact and retryable. The API discards feed validators after successful logout; responses begun earlier cannot repopulate that cache.
- Account updates identify the owned feed by stable feed/account IDs. A changed owner username navigates to the canonical encoded owner/feed URL using history replacement, restoring owner controls from the authoritative session and feed list.
- Feed-page star failures use the existing safe error translation and display a notice. The control remains retryable; English, French and Arabic failures are covered without unhandled promise rejections.
- Read history uses dn_read:v3 keyed by reader identity and stable feed ID. On first access, prior dn_read:v2 entries from the same reader namespace are matched using edition IDs returned for that feed, allowing old usernames and slugs to migrate. Unrelated readers/anonymous scopes remain isolated. Ambiguous older ln_read records are not attributed to an account. Unmatched or no-longer-retained legacy IDs remain untouched, since their feed identity cannot be proven. Existing v3 records are authoritative, including empty records after marking an edition unread; legacy flags cannot reappear on refresh.

The four initial local regressions reproduced the failures. Verification uses local browser fixtures and fake providers; no production content or paid inference is used. Tests, typechecks and deployment are reported separately. These changes do not deploy themselves.


## Storage and session follow-up

The mounted reader's in-memory read set remains authoritative across edition refreshes when the stable reader/feed identity is unchanged. History initializes only for a new identity; read/write storage failures cannot replace already tracked progress with empty or stale data. Both read-and-write blocking and write-only failures have refresh regressions. A different reader or feed still initializes its own isolated history.

Feed viewer resolution now distinguishes confirmed authenticated, confirmed anonymous, and unresolved/error states. A session failure (including an authenticated response missing account identity) supplies undefined reader identity, never the anonymous namespace. Published feed content may still load, but mark-read controls are disabled until identity is confirmed. A localized Retry session control restores session/owner lookup independently. Failed owner-feed lookup retains a successfully confirmed account. The browser regression verifies session 503 plus successful feed data, no anonymous-history mutation, then session retry and account-scoped read persistence.

## Historical search and incremental read migration

Legacy feed reads now inspect the same bounded 100-edition window as search, returning the recent 50 plus a SHA-256 publication marker. This increases the legacy read window from 50 to 100 rows; it adds no migration or model calls. Unchanged markers preserve historical search results without another search. A changed or missing marker invalidates old search prose and detail dialogs before revalidation; failed revalidation shows an error rather than retaining potentially withdrawn content.

Stable v3 read arrays remain compatible. A reader/feed-scoped `:considered` companion records which discovered edition IDs have already been handled, including explicit unread choices. Search results now supply historical IDs for incremental migration. Legacy records remain intact. Old v3 arrays have no per-ID decision metadata: known omissions are preserved conservatively, but a previously unseen omission cannot retrospectively distinguish a lost migration from a pre-upgrade explicit unread choice. New explicit unread decisions are preserved across discovery and reload; blocked storage retains in-memory decisions but cannot guarantee persistence across reloads.

Explore displays a localized successful-empty state separately from loading, failed requests, and searches with no matches.

## Cross-tab progress and Explore pagination

Read history now persists individual read/unread decisions and baseline migrated-read facts under the existing reader/feed scope. The aggregate v3 array remains a compatibility cache. Independent editions no longer overwrite each other, explicit unread records override baseline read facts, and storage events update other tabs using the latest stored value rather than a delayed event payload. Same-edition conflicts use the last successfully stored decision. Browser-storage failures retain this tab's in-memory progress; they cannot guarantee cross-tab or reload persistence.

Feed-refresh failures and query-scoped search failures are separate UI states. A healthy background feed response cannot dismiss a search failure; successful search retry or leaving the failed query clears it.

Successful star changes restart ranked Explore pagination and invalidate an older page still in flight. An overlapping later page also restarts the prefix instead of silently deduplicating away evidence of a ranking shift made by another reader. Offset pagination is not an immutable global snapshot under arbitrary concurrent edits; these paths recover known local changes and detected overlap. Explore search still filters loaded pages, explicitly says so while more pages remain, and offers Load more feeds rather than claiming an unperformed server-wide search returned nothing.

## Confirmed votes, query identity and catalog revision

Confirmed vote events now carry the mutation result. Explore applies viewer-scoped confirmations to refreshed cards (using stable feed identity when already loaded) until the listing acknowledges that vote; an older conflicting response cannot undo a successful star or unstar. Confirmations clear on viewer changes. The ordinary browser fixture now persists votes, while dedicated delayed-response tests deliberately return stale votes in both directions.

Displayed reader editions have a separate feed/query identity. A failed new search settles the request as failed without relabelling previous editions as matches; unrelated rows and detail dialogs remain hidden, and failure is not presented as a confirmed empty publication set.

Migration **0099_explore_catalog_revision.sql must be applied before deploying this Worker**. It adds one catalog revision row and transactional triggers for public eligibility, ranking, relevant feed identity and owner availability changes. Routine scheduling updates do not advance it. Each listing reads this row before and after its bounded query, returns a viewer-scoped revision token, and rejects stale/mixed pages with `EXPLORE_CHANGED` (409). The current client pins subsequent pages to that revision and restarts on rejection, including removals that produce no overlap. This adds two constant-size revision reads per successful page; it does not scan all feed history. A first-page conflict exposes Retry instead of an unbounded automatic retry loop. Older clients that omit tokens retain their prior best-effort pagination until refreshed.

The migration is forward-compatible with the prior Worker for code rollback; it has only been tested on local D1 here. No staging or production migration or deployment is authorized or performed by these review fixes.

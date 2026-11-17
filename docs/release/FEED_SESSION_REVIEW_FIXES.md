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

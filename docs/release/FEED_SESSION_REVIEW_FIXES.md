# Feed-session review fixes

Branch: integration/beta-ui-extraction; base d321d845.

- Successful feed-page logout aborts the active read, invalidates pending read/search work, clears loaded editions, detail/report selection, account/editor state and feedback, and replaces the current history entry with Home. Logout failure keeps the reader intact and retryable. The API discards feed validators after successful logout; responses begun earlier cannot repopulate that cache.
- Account updates identify the owned feed by stable feed/account IDs. A changed owner username navigates to the canonical encoded owner/feed URL using history replacement, restoring owner controls from the authoritative session and feed list.
- Feed-page star failures use the existing safe error translation and display a notice. The control remains retryable; English, French and Arabic failures are covered without unhandled promise rejections.
- Read history uses dn_read:v3 keyed by reader identity and stable feed ID. On first access, prior dn_read:v2 entries from the same reader namespace are matched using edition IDs returned for that feed, allowing old usernames and slugs to migrate. Unrelated readers/anonymous scopes remain isolated. Ambiguous older ln_read records are not attributed to an account. Unmatched or no-longer-retained legacy IDs remain untouched, since their feed identity cannot be proven. Existing v3 records are authoritative, including empty records after marking an edition unread; legacy flags cannot reappear on refresh.

The four initial local regressions reproduced the failures. Verification uses local browser fixtures and fake providers; no production content or paid inference is used. Tests, typechecks and deployment are reported separately. These changes do not deploy themselves.

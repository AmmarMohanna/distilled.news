# Synthetic production canary

This cohort exercises Distilled.news continuously without pretending to be real users.

## Shape

- 12 accounts: five English, four Arabic, three French.
- 24 public feeds: 10 English, 8 Arabic, 6 French.
- 30 configured sources across direct RSS, Google News RSS, and public Telegram.
- Two feeds per account, daily publishing, 15-day retention, low processing intensity.
- `$0.03` daily LLM budget per feed; the cohort ceiling is `$0.72/day` before non-LLM infrastructure costs.
- Every account, feed, source, username, title, and email is visibly marked as canary data.
- Canary feeds have zero stars, so they do not appear in the public Explore results.
- Accounts use `example.invalid` mailboxes and an invalid password hash. They cannot receive mail or sign in.

## Commands

Run from the repository root:

```bash
npx wrangler d1 execute lownoise --config apps/worker/wrangler.toml --remote --file scripts/synthetic/seed.sql
npx wrangler d1 execute lownoise --config apps/worker/wrangler.toml --remote --file scripts/synthetic/audit.sql
```

`seed.sql` is idempotent. Re-running it restores missing fixture records without replacing accumulated runtime state.

## Review schedule and release gates

Audit after 15 minutes, 1 hour, 6 hours, 24 hours, 72 hours, and 7 days.

At 15 minutes:

- All 30 sources have a `last_checked_at` value.
- No source has a persistent configuration or parsing error.
- No processing job remains queued for more than 10 minutes.

At 24 hours:

- All 24 feeds have imported at least one current item, unless the source legitimately published nothing.
- At least 80% of feeds have a published edition; every missing edition is explained by an empty or irrelevant source window.
- Failed jobs are zero after retry.
- Total estimated LLM cost stays below `$0.72` for the UTC day.
- English editions are English, Arabic editions are Arabic/RTL, and French editions are French.
- No HTML/XML entities, replacement characters, template prose, repeated underscore rules, or citation-number artifacts appear.
- Every factual summary has usable evidence and opens correctly in Digest and Timeline modes.

At 72 hours and 7 days:

- Source errors recover automatically and do not repeat unchanged for more than 6 hours.
- Edition cadence remains daily with no duplicates or unexplained gaps.
- Retention, queue depth, R2 storage, and cost grow within the configured bounds.
- A human reads the latest sample from every feed for typos, hallucinated transitions, mixed-language prose, poor Arabic shaping, awkward French, and irrelevant inclusions.

## Removal

First query the cohort R2 objects while the D1 references still exist:

```sql
SELECT DISTINCT raw_payload_key
FROM raw_messages
WHERE briefing_id LIKE 'briefing_canary_%' AND raw_payload_key IS NOT NULL;
```

Delete those keys from `lownoise-raw`, then run:

```bash
npx wrangler d1 execute lownoise --config apps/worker/wrangler.toml --remote --file scripts/synthetic/remove.sql
```

The account deletion cascades through feeds, sources, messages, jobs, editions, and usage events. The final query confirms no D1 cohort records remain.

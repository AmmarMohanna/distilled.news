# General image

This is the overview of the specific APIs and scrapers we plan to compare for each Distilled.news source. We will choose a primary provider and fallback using measured quality, completeness, freshness, reliability and cost.

Apify and Bright Data provide scrapers accessed through APIs. They are separate from the source platforms' official APIs.

## API and scraper comparison by source

| Source | Specific options to test |
|---|---|
| **News/article websites** | **Direct HTTP** from our server; **[Zyte API](https://docs.zyte.com/zyte-api/usage/reference.html)** in HTTP mode; **[Bright Data Web Unlocker](https://docs.brightdata.com/api-reference/rest-api/unlocker/unlock-website)**; **Playwright + Chromium** for browser rendering. |
| **RSS / Atom feeds** | Fetch the feed, then compare **Distilled's current parser** with **Python feedparser** on identical captured content. These are feed parsers. |
| **Google News** | **Google News RSS** versus the configured Apify actor **`groupoject/google-news-scraper`**. |
| **Telegram channels** | **Distilled's existing public-page scraper** for **`t.me/s/<channel>`** versus the **Telegram API through [Telethon](https://docs.telethon.dev/en/stable/basic/signing-in.html)**. |
| **X account posts** | **[Official X user-post API](https://docs.x.com/x-api/users/get-posts)**; the configured **Apify X actor** listed below in **profile mode**; **[Bright Data post discovery by profile URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/twitter-posts-discover-by-profile-url)**. |
| **X keyword searches** | **[Official X search API](https://docs.x.com/x-api/posts/search/introduction)** versus the same **Apify X actor in search mode**. |
| **LinkedIn company posts** | Apify **`harvestapi/linkedin-company-posts`** versus **[Bright Data company-post discovery](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-company-url)**. |
| **LinkedIn profile posts** | Apify **`harvestapi/linkedin-profile-posts`** versus **[Bright Data profile-post discovery](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url)**. |

The exact configured **Apify X actor** is:

```text
kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest
```

Its profile and search modes are separate experiments. The actor IDs above are repository defaults; check the actual source/environment overrides, actor build and account access before testing. See [Worker configuration](../apps/worker/wrangler.toml).

For LinkedIn, include the **official Posts API** as an additional candidate only where the required authorized read access is available. It is not assumed to cover arbitrary public companies or profiles. [Official permissions](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-03).

Any other configured `apify:` source gets its own comparison using its exact actor ID and a task-equivalent alternative where appropriate.

## What "our Telegram scraper" means

It means the custom Telegram scraping code already in the project, including the public-page parser in [telegram.ts](../packages/connectors/src/telegram.ts).

The existing collection approach:

1. Opens a channel's public webpage at `https://t.me/s/<channel>`.
2. Reads the page's HTML.
3. Extracts visible messages, dates, links and available media information.

We will compare this approach with Telethon, which retrieves messages through Telegram's API, to measure missing posts, completeness and reliability.

See [Example Telegram](<example telegram.md>) for a one-channel walkthrough with commands, illustrative code and comparison steps.

## How we will compare them

Every enabled candidate goes through three stages:

1. **Small pilot:** Check that collection, saved evidence and measurements work.
2. **Controlled comparison:** Compare against checked reference content and test failures, pagination and recovery.
3. **Seven-day live testing:** Measure ongoing reliability, freshness, cost and real fallback behavior.

These are **candidates to test, not selected winners**. Missing access or insufficient evidence must remain explicit in the results.

Follow [Scraper and API Testing on the University VPS](SCRAPER_TESTING_STEPS.md) for server setup and execution details, and the [detailed evaluation plan](SCRAPER_AND_API_EVALUATION_PLAN.md) for scoring rules.

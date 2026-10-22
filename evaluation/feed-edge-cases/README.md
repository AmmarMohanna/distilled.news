# Feed edge-case dataset

Timed test scenarios for the edge cases a feed meets across briefing windows: a source repeating itself in the next window, copies across outlets, corrections, late or undated items, window backlogs and per-source quirks. The case list and how it was chosen are in `cases.json` (37 cases, A1 to D9).

All the news is **fictional**. It is set in the made-up Republic of Calvera (`world.json`), so a test feed that publishes on QA can never pass for real news. Feed titles start with `[TEST]`.

## Layout

| Path | What it is |
|---|---|
| `cases.json` | The 37 cases, their priority, the expected behaviour, and whether code or the model decides them |
| `world.json` | Fictional publishers, people and the three feed profiles (politics, tech, football) |
| `scenarios/*.json` | 21 scenarios, 213 items. Each one is a small feed with its sources, a timeline of items and checks |
| `tools/validate.mjs` | Checks references, times and edits, and that every case has at least one check |
| `tools/build.mjs` | Writes every scenario with absolute times and full text for a given start time |
| `tools/serve.mjs` | Serves the scenarios as live sources whose content follows the clock |

No dependencies. Plain Node 22:

```sh
node evaluation/feed-edge-cases/tools/validate.mjs
node evaluation/feed-edge-cases/tools/build.mjs --start 2026-10-23T09:00:00Z --out /tmp/edge-cases
node evaluation/feed-edge-cases/tools/serve.mjs --start next --port 8787 --base https://<public-url>
```

## Scenarios

| Scenario | Feed | Cases | Windows | What happens |
|---|---|---|---|---|
| `01-same-source-repeat` | politics | A1, A2, A3, C6 | 2 | One outlet repeats its own story in the next window |
| `02-follow-up-new-fact` | politics | A4 | 2 | Follow-up article repeats the background and adds one new figure |
| `03-corrections-and-edits` | politics | A5, A6 | 2 | Same article edited in place: one material correction, one typo fix |
| `04-storyline-three-windows` | politics | A7, B4 | 3 | Fuel subsidy bill moves from proposal to vote to signature |
| `05-sources-disagree` | politics | B5 | 1 | Ministry and union give very different turnout figures |
| `06-wire-copy-and-corroboration` | politics | B1, B3 | 1 | Wire story printed word for word by two outlets, plus an independent report |
| `07-google-news-overlap` | politics | B2, D3 | 1 | Google News returns an article the feed also gets from the publisher's RSS |
| `08-social-echo-and-thread` | tech | B6, D7 | 1 | Article, X thread and LinkedIn post about the same data centre |
| `09-two-languages` | politics | B7 | 1 | Same news in English (RSS) and Arabic (Telegram), each with one extra fact |
| `10-rumour-confirm-deny` | tech | B8, B9 | 2 | One rumour is confirmed; another is denied and its post deleted |
| `11-late-boundary-bad-dates` | politics | C1, C2, C5 | 2 | Late arrival, item exactly on the boundary, future date, broken date |
| `12-old-and-undated` | politics | C3, C4 | 1 | A three-day-old article shows up now; an article has no date |
| `13-only-story-rejected` | politics | C7 | 2 | The window's only story has a headline its body does not support |
| `14-backlog-of-windows` | politics | C8 | 4 | Four windows pile up past their deadline and fold into one edition |
| `15-new-source-backlog` | football | C9 | 1 | A new source returns 110 old items and three current ones on its first poll |
| `16-review-pressure-at-deadline` | tech | C10 | 2 | Thirty items arrive in the last minutes before the window closes |
| `17-x-interval-overlap` | politics | C11 | 2 | An X post exactly on the edge between two frozen scan intervals |
| `18-rss-identity-churn` | politics | D1, D2 | 2 | A feed that mints new guids every fetch; a link that gains utm parameters |
| `19-telegram-forward-edit-media` | politics | D4, D5, D6 | 2 | Telegram forward, edited messages and a photo-only post |
| `20-relevance-and-paywall` | politics | D8, D9 | 1 | Promo and off-topic items; a paywalled article with only an excerpt |
| `21-same-headline-different-event` | football | A8 | 2 | Two different matches with the same headline in consecutive windows |

Every scenario is its own feed, so one failure does not leak into another.

## Scenario format

```jsonc
{
  "id": "02-follow-up-new-fact",          // must match the file name
  "cases": ["A4"],
  "feed": "politics",                      // a profile in world.json
  "schedule": {"durationMinutes": 30, "timezone": "Asia/Beirut"},
  "windows": 2,                            // how many windows the scenario spans
  "run": {...},                            // optional hints for the runner (holds, forced rejections, X scans)
  "sources": [{"key": "selin-daily", "type": "rss", "publisher": "selin-daily"}],
  "items": [...],
  "checks": [...]
}
```

**Times** are relative to the replay start, so a scenario runs at any time of day. `W2+8m` is 8 minutes after window 2 opens, `W1-3d` is 3 days before window 1 opens, and `W2` alone is the W1/W2 boundary. Units are `s`, `m`, `h` and `d`.

**Item fields**

| Field | Meaning |
|---|---|
| `id`, `source` | Unique id within the scenario; source key |
| `appearsAt` | When the item first shows up in the source listing |
| `publishedAt` | The date the source claims. Defaults to `appearsAt`; `null` means no date; an edit keeps the date of what it edits |
| `rawPubDate` | A literal, possibly broken, RSS date string (case C5) |
| `guid`, `url` | Defaults: the item id, and an article page on the replay server. `"guid": null` drops the guid so the link is the key |
| `variantOf` + `edits` | Builds this item from an earlier one with exact find-and-replace edits. Each `find` must occur exactly once, so a variant changes only what it says |
| `editOf` | Same item, edited in place: keeps the guid and URL and replaces the earlier version in the listing |
| `op: "delete"` | With `editOf`: the source removes the item |
| `change` | One line on what this variant or edit changes. Required for every variant, edit and delete |
| `excerptOnly`, `paywalled` | RSS shows only an excerpt; the article page shows a teaser and a paywall |
| `forwardedFrom`, `inReplyTo`, `media`, `lang` | Telegram forwards, X threads, photo posts, non-English items |
| `generate` | Expands into many templated items (backlogs in 15 and 16) |

Sources take `type` (`rss`, `google-news`, `x`, `telegram`, `linkedin`), `publisher`, and optionally `maxItems` and `guidPolicy: "per-fetch"` (case D1).

## Checks

Each check names the cases it tests. Wildcards like `archive-*` match by id prefix.

| Type | Passes when |
|---|---|
| `edition` | The window is `PUBLISHED` or `QUIET` (settled DEFERRED, no edition), with `stories` (a number or `{min,max}`), `mustMention` and `mustNotMention` text |
| `editionCount` | Exactly `count` editions across the listed windows |
| `fingerprintSkip` | The connector skips the item as unchanged at that window or scan |
| `duplicateOf` / `notDuplicate` | The feed's copy decision groups, or does not group, the item with `of` |
| `sameStory` / `separateStories` | Items end up in one event (or storyline, with `level: "storyline"`), or in different ones |
| `notRetold` | The window's story does not repeat facts from earlier editions, apart from `except` |
| `correction` | The edit is treated as a correction, and the text follows `mustMention` / `mustNotMention` |
| `noStory` | The item does not become a story on its own in that window |
| `inWindow` | The item counts toward that window, and only that one when `exactlyOne` is set |
| `freshness`, `dateNotTrusted`, `timeFramed` | Freshness state, an untrusted claimed date, time framing when a STALE item is used |
| `windowNotHeld` | The listed items do not hold the window past its deadline |
| `deferred`, `supersededInto`, `deferredCoverage` | Window settlement: DEFERRED rather than FAILED, folded into a later window, unfinished work carried to the next window |
| `seenOnce`, `excerptOnly`, `attributed`, `corroboration`, `hedged`, `deleted` | See the scenario that uses them |

`cases.json` says per case whether code or the model decides it. Checks for code-decided cases have one right answer. Checks on model output (A3, A4, A7, B3 to B9, D6 to D8) state what a good briefing does, so read them alongside the edition the first few times.

## How to run it

### Local replay (free)

Load each built scenario into the Miniflare D1 tests, step a fake clock through the windows, and feed each source listing at each poll. The checks for code-decided cases can be asserted directly. `run.tier1` holds the hints this needs: forced verifier rejection in 13, and the two bounded X scans in 17. **This harness is not built yet.** It is the next step.

### Live replay on QA (spends model budget)

1. Start `serve.mjs` somewhere the QA Worker can reach, with `--base` set to that public URL and `--start next`.
2. For each scenario, create a QA feed from the `world.json` profile with the scenario's schedule, and add its `rss` and `google-news` sources by the URLs on the server's index page.
3. Let it run for the scenario's windows plus the 10-minute grace period, then compare editions and `/api/admin/briefings/:feedId/pipeline-trace` with the checks.

Notes:

- Real Google News links use `news.google.com/rss/articles/...`, which the pipeline cannot resolve, so it falls back to the excerpt. The scenarios use the same kind of link on purpose.
- The X, Telegram and LinkedIn sources are served as JSON. The real connectors cannot read that, so on QA those items must be sent through `POST /v1/downstream/handoff` with the matching connector type, or be covered only by the local replay.
- `14-backlog-of-windows` needs briefings held until `W5+15m` (see its `run` block).
- For scale: the 10-feed QA run on 16 October spent about $24 in 2.5 hours. Running only the code-decided scenarios first is cheaper.

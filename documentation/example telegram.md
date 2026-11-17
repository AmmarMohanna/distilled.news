# Example Telegram

## Summary

This walkthrough describes how we would compare **Distilled's existing Telegram public-page scraper** with **Telegram's API through Telethon**, using one public channel.

**Runnable implementation:** Use `telegram_public` and `telegram_api` in the [benchmark package](../evaluation/acquisition-benchmark/README.md), with `preflight`, `collect`, `process`, and `telegram-login`. The shared harness is now implemented.

**The original standalone snippets below remain illustrative.** The example collector/comparison scripts named below are not implemented. The commands are provided for later execution; this document does not mean server setup or live collection has happened.

| Method | What we would collect |
|---|---|
| Existing public-page scraper | Download `https://t.me/s/<channel>` and use Distilled's parser to extract visible posts from the HTML. |
| Telethon | Sign in with a dedicated test account and request messages from the same channel through Telegram's API. |

We would compare checked post IDs, text, dates, links/media, duplicates, collection time and errors. Neither collector's output automatically becomes the correct answer.

## 1. Connect to the server

From **Windows PowerShell**:

```powershell
ssh bench@SERVER_IP
```

Replace `SERVER_IP` with the privately supplied address. This assumes the `bench` account and SSH access have already been prepared. Follow [server preparation](SCRAPER_TESTING_STEPS.md#server-preparation) first if needed.

## 2. Prepare the tools

On the server, in **Bash**:

```bash
cd /home/bench/work/distilled.news
node --version
```

Use Node 24+ for the existing TypeScript parser and the benchmark's Python 3.12 environment. The server setup guide explains how to install the interpreter separately from Ubuntu's system Python.

If the benchmark virtual environment does not already exist, create it using the prepared Python 3.12 interpreter:

```bash
python3.12 -m venv evaluation/acquisition-benchmark/.venv
```

Then activate it and install the example's API client:

```bash
source evaluation/acquisition-benchmark/.venv/bin/activate
python --version
python -m pip install "Telethon==1.45.0"
mkdir -p evaluation/acquisition-benchmark/data/telegram-example
```

If `python3.12` is not on PATH, use the managed interpreter/environment commands in the [server setup guide](SCRAPER_TESTING_STEPS.md#p5-install-python-and-run-existing-offline-tests). Record exact Node, Python and Telethon versions before measurement.

Keep captures and references under the benchmark's ignored `data/` directory. Keep API credentials and the Telegram session in the private locations described in the [credential instructions](SCRAPER_TESTING_STEPS.md#p7-store-credentials-privately).

## 3. Choose the channel and freeze the comparison window

Select one accessible public channel. Prepare a manifest like this:

```json
{
  "channel": "CHANNEL_USERNAME",
  "window_start": "2026-09-11T12:00:00Z",
  "window_end": "2026-09-12T12:00:00Z",
  "maximum_messages": 50
}
```

These values are illustrative. Replace the username and choose a recent 24-hour window when the experiment is performed. Save the manifest at:

```text
evaluation/acquisition-benchmark/data/telegram-example/manifest.json
```

Both collectors would use the same frozen timestamps: include posts at or after `window_start` and before `window_end`. Record the actual acquisition times separately. Posts added after the cutoff should not create a false disagreement.

Manually check a small set of posts in that window and save:

- Original channel and message IDs/URLs.
- Full text or caption.
- Publication-date evidence.
- Expected media and links.
- Time of inspection and a reference snapshot where available.

These checked examples supply independent reference evidence. A small selected set measures coverage of that set, not the completeness of the entire channel history.

## 4. Prepare the public-page collector

We would write a helper that:

1. Downloads `https://t.me/s/CHANNEL_USERNAME`.
2. Saves the original HTML and response metadata.
3. Calls the existing public-page parser in [telegram.ts](../packages/connectors/src/telegram.ts).
4. Filters parsed posts to the frozen window and records any output limit.
5. Saves normalized messages, elapsed time and errors.

Its central parsing operation would look like this. This is an **illustrative excerpt**, assuming a helper at the repository root; `savedHtml` and `channel` would come from the download and manifest:

```javascript
import {
  parsePublicTelegramChannelPage
} from "./packages/connectors/src/telegram.ts";

const messages = parsePublicTelegramChannelPage(savedHtml, {
  username: channel,
  receivedAt: new Date()
});
```

The complete helper would enforce a **45-second total download deadline and 10 MiB decoded-body limit**, record failures, and preserve available evidence. An HTTP 200 with an error page or zero parsed messages would require investigation; it would not automatically count as correct collection.

This first example would read the **latest public page**. That page may not contain every post in the requested 24-hour window. Record its visible ID range and limited scope. Investigate absent posts as possible page-window limits, parser omissions or source changes.

## 5. Prepare the Telethon collector

Obtain a Telegram API ID/hash and sign in interactively with a dedicated test account. Login may require the account's phone number, code and two-step password. Complete login before timed collection; keep its saved session private. [Telethon sign-in instructions](https://docs.telethon.dev/en/stable/basic/signing-in.html).

The central collection logic would look like this. `client` would already be authenticated, and the window arguments would be timezone-aware datetime values parsed from the same manifest:

```python
async def collect(client, channel, window_start, window_end):
    collected = []

    async for message in client.iter_messages(
        channel,
        offset_date=window_end,
        limit=51,
    ):
        if message.date < window_start:
            break

        collected.append(message)

    truncated = len(collected) > 50
    return collected[:50], truncated
```

Telethon retrieves history from newest to oldest by default, and `offset_date` is exclusive. The extra message helps identify a 50-message cap. A cap hit means incomplete output; absence of a cap hit alone does not prove complete coverage. [Message retrieval reference](https://docs.telethon.dev/en/stable/modules/client.html#telethon.client.messages.MessageMethods.iter_messages).

The complete helper would also:

- Resolve and verify the intended public channel.
- Set a total collection deadline and explicit retry policy.
- Respect flood waits, recording deferred/failed work instead of waiting indefinitely.
- Save original returned message objects and normalized records.
- Preserve original dates, edit times, IDs and media references separately.
- Record output/scan limits and handle service messages consistently with the chosen post definition.
- Close the connection and save failure records if collection stops early.

This example reads messages. It does not require sending posts, joining channels or changing account settings.

## 6. Run the collectors after implementation

Once the helpers exist, their intended commands could look like this, from the repository root:

```text
node telegram-public.mjs evaluation/acquisition-benchmark/data/telegram-example/manifest.json
python telegram-api.py evaluation/acquisition-benchmark/data/telegram-example/manifest.json
python compare-telegram.py evaluation/acquisition-benchmark/data/telegram-example/public.json evaluation/acquisition-benchmark/data/telegram-example/api.json
```

**These are proposed script names and interfaces, not currently available commands.** The earlier snippets show central logic, not complete scripts implementing these interfaces.

The helpers would save separate raw evidence and comparable normalized outputs:

```text
telegram-example/
  manifest.json
  reference.json
  public-raw.html
  api-raw.json
  public.json
  api.json
  comparison.json
```

Both normalized outputs would include:

```text
channel
message_id
text/caption
publication_time
original_post_url
links/media information
collection_time and duration
errors, limits and completion status
```

Run both methods close together, saving their order and start/end times. Repeat in a new run directory to preserve previous evidence. Changes or deletions between captures require independent review.

## 7. Inspect the comparison

Compare original message IDs within the same channel. For shared IDs, check text, dates, links and media. Record duplicates separately rather than letting them inflate counts.

| Check | Public-page scraper | Telethon |
|---|---|---|
| Manually checked posts found | Measured | Measured |
| Correct text and dates | Verified | Verified |
| Missing media/link information | Recorded | Recorded |
| Duplicate IDs | Counted | Counted |
| Collection time and errors | Measured | Measured |
| Window/output limitations | Latest-page scope and caps | API history/scan caps and access restrictions |

Posts appearing in only one output need investigation. Determine whether the cause is a visible-page limit, pagination, parsing, API access, different post definitions or a legitimate source change. Neither a larger post count nor agreement between both providers proves correctness.

An unavailable/failed collector must appear as unavailable/failed. Do not present it as a successfully collected empty channel. Assess text and media manually for this first example before building automatic quality scores.

## 8. What comes after this example

This is the first small Stage 1 example. Once both methods and evidence recording work:

1. Finish the two-channel pilot with two rounds per method.
2. Expand Stage 2 to more channels and checked posts; test paging, failures, restarts and duplicates. Use controlled fixtures or an authorized test channel for edits/deletions and bursts.
3. Run Stage 3 for seven days at a frozen cadence, measuring freshness, reliability, resources and cost, then test actual fallback behavior.

The final decision would identify a primary collector, a useful fallback if demonstrated, and the cases each still misses. Follow the [full testing steps](SCRAPER_TESTING_STEPS.md) for stage sizes and completion criteria, or [General image](<general image.md>) for the complete source/provider overview.

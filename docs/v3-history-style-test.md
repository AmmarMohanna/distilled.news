# Does old briefing style influence new output?

User-requested controlled comparison, October 24, 2026. Four fresh GPT-4.1 editor requests used the same system instructions, temporal style, original articles, reporting window and history identifiers/dates/format. Within each English/Arabic pair, only prior briefing prose changed: routine sourcing was shortened and missing-detail/publication-date/topic-absence commentary was removed. Counts, locations, reported actions and meaningful attribution were preserved.

**No output cleanup was applied.** These are raw editor responses, not results made concise by the new copy cleaner. All four provider responses reported zero cached input tokens.

| Output language | Original history | Clean history | Original / clean request time |
|---|---|---|---|
| English | 2 of 3 items contained filler | 0 of 3 contained filler | 4.404 / 6.133 seconds |
| Arabic | 2 of 2 items contained filler; one strike location omitted | 0 of 2 contained filler; both strike locations included | 3.707 / 3.703 seconds |

The clean English output said simply: “An airstrike was reported targeting the town of Kfar Tibnit in Lebanon.” The clean Arabic output retained the embassy warning and described a strike on Kfar Tibnit and another on Wadi al-Hujayr, without missing-casualty or publication-date commentary.

This supports prior briefing prose as a contributor to the observed style. It is one paired observation per language on one saved window, not proof that history is the only cause or that clean history will prevent every recurrence. History remained English in both pairs to keep evidence constant apart from requested output language. The experiment was not a full publication or complete factual audit; geographic context added to the short Arabic strike text was not independently evaluated. The English candidate took longer, so no latency improvement is claimed.

Four calls cost **$0.029892**. The still-valid $2 task now totals 34 calls and **$0.13327315**, all settled, with zero outstanding operations. Prior records/holds remain untouched. No runtime change, deployment, edition mutation or notification was made for this test.

Exact before/after history, raw parsed responses, hashes, usage and timings: [history-style-test.json](../benchmarks/results/v3-reader-copy/history-style-test.json). Full generated text: [history-style-outputs.md](../benchmarks/results/v3-reader-copy/history-style-outputs.md). Full wire requests and provider receipts remain under ignored `.local-reports/v3-system-concision/history-test-*`.

The next engineering option is presentation-only cleanup of prior prose while preserving all facts, uncertainty, identifiers and stored history. This test does not implement it or remove the existing reader-copy safeguard.

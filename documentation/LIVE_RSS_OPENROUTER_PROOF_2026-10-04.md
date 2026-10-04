# Bounded live BBC/OpenRouter end-to-end proof — 2026-10-04

This is live public-network acquisition and actual provider execution on local Miniflare D1/R2. It is not a deployed/production proof or a full-article extraction success.

## Run and source boundary

The existing local owner fixture explicitly approved BBC World RSS: https://feeds.bbci.co.uk/news/world/rss.xml. One fetch was capped at two items. The run observed the feed at 2026-10-04T13:23:55.207Z. Collection coverage remained PARTIAL; no safe checkpoint was claimed. The durable connector allocator/checkpoint are test fixtures, not a claim that the friend's production connector lane is complete.

Selected URLs:

- https://www.bbc.co.uk/news/articles/ckreyjzzzywqo?at_medium=RSS&at_campaign=rss
- https://www.bbc.co.uk/news/articles/cxly4nym57q9o?at_medium=RSS&at_campaign=rss

The pipeline used the actual RSS connector, scoped R2 payloads, durable intake receipts/jobs, acquisition/evidence normalization, feed-scoped intelligence, deterministic production scoring, selection, actual GPT synthesis and grounding, public edition/citations and replay/retention/withdrawal checks. The source representation was ARTICLE_EXCERPT with UNKNOWN completeness, 207 and 211 characters; it was never labeled a complete article.

The resulting local edition had two stories and two exact evidence citations. Edition ID: 08373ed851ab5614d87ba4a5e601210d35834f9901e4d1d8d6397f6d3bdd5c44. Its evidence revision IDs were c81285eb-31dc-4a72-bac5-29fbb83885d7 and 0a953efa-87a4-42c1-9859-53c8dae49726. A fresh store read and repeated request returned the same edition with no additional provider calls. Historical support remained resolvable after local Feed deletion; withdrawal removed public readability without mutating the historical edition. These fixture databases are disposed after testing; the retained local JSON records the observed result.

## Actual GPT output excerpts

These are the first reader-visible claim from each published story, not reconstructed examples:

> Australia is investigating the Flydubai co-pilot's links to the country.

> A Kyiv bridge was hit in a further Russian drone attack as the German chancellor made a surprise visit.

Each story also included a second grounded claim. Exact full outputs, citations, generation provenance and execution records remain in ignored `.local-reports/live-bbc-openrouter.json`; third-party evidence/model transcripts are not committed.

## Actual provider calls

| Stage | Model | Result | Reported cost USD |
|---|---|---|---:|
| Synthesis |openai/gpt-4.1-mini |Succeeded,4384ms |.0018004 |
| Grounding |openai/gpt-4.1-mini |Succeeded,1792ms |.0007704 |
| Experimental salience on the stored Flydubai Event |typesafe/jev-1.13 |Low-confidence fallback to deterministic score.544167 |.000022764 |
| Experimental salience on the identical Event input |openai/gpt-4.1-mini |HIGH,.75, no fallback |.0001952 |

Total: four calls, confirmed reported cost USD 0.002788764, below the USD 0.12 reservation ceiling. Briefing synthesis/grounding used 3835 input and 648 output tokens. Their persisted generation latency was 6960ms, including runtime work; it is distinct from the individual provider-stage latencies. Experimental judge calls did not replace production selection. JEV is a judgment capability, not the prose writer. No native quality conclusion or superiority is supported by this one run; frozen human-label evaluation remains pending.

## Full article page probe

A separate zero-model-call probe used the existing bounded WorkerPublicSourceFetch and parseStructuredHtmlArticle on the two exact URLs. Both returned 200, 421313 and 407381 HTML characters, but neither yielded a full article through the current generic extractor. No body text was invented or silently substituted. This is an observed extraction-compatibility limitation for these BBC pages; full-page end-to-end acquisition was not demonstrated.

## Reproducible opt-in execution

The harness reads process environment. The owner's `.env` is ignored and untracked; no credential contents were printed or committed. Run only with authorized credentials and explicit paid opt-in. The whitespace-free test regex avoids Windows command-shell splitting of a multiword filter:

```powershell
node --env-file=.env -e "const {spawnSync}=require('node:child_process');const env={...process.env,DISTILLED_V1_LIVE_RSS_OPENROUTER_PROOF:'true'};const r=spawnSync('corepack',['pnpm','--filter','@distilled/worker','exec','vitest','run','src/v1-intelligence/rss-pipeline.test.ts','-t','real.RSS.to.actual.OpenRouter','--maxWorkers=1'],{env,stdio:'inherit',shell:true});process.exit(r.status??1);"
```

The first paid Windows invocation used a multiword filter and also ran two additional non-paid tests: three passed, 59 skipped, 15 files selected. The actual live test passed in 13.77s; no additional provider calls occurred. The original aggregate console counter still said zero model calls; the persisted execution/judgment records correctly show four. That test-only counter was corrected without repeating paid requests.

For the saved-page probe, set DISTILLED_V1_SAVED_ARTICLE_PROBE=true and run the same file filtered to `checks.saved.real.article.pages`; it requires the ignored saved report and makes at most two public HTTP requests, no provider calls. Probe: one passed, four filtered skips.

Normal regression command:

```powershell
corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/rss-pipeline.test.ts src/v1-intelligence/model.test.ts --maxWorkers=1
corepack pnpm --filter @distilled/worker typecheck
```

Default runs do not access the network, load local credentials or spend provider budget. Existing source authorization, immutable support, per-stage provider reservations and production flags remain unchanged. No deployment or remote migration occurred.

Final focused verification: worker typecheck passed; RSS pipeline and model tests passed (2 files, 4 tests passed, 3 opt-in tests skipped, 12.87s). git diff --check passed. The full workspace suite was not repeated for these test-harness/documentation-only changes.

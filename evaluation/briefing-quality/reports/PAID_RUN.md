# Proposed isolated development pilot — approval pending

Exact manifest: [paid-run.proposed.json](paid-run.proposed.json). SHA-256:
`592b5940e47963f4e22c2f7bc9432347c562409f3c495bd3c9c6721a7388aca0`.

Nine windows: all three consecutive windows of education-en-oct21, culture-fr-oct21 and lebanon-ar-oct21. Compare single-LLM and current V3; use the corresponding already measured extractive outputs. One English window is empty. Each system starts each track independently, explicitly cold-starts missing initial history and then carries only its own locally published reader prose. No references or another system's outputs become history. No candidate model variant is justified yet.

The estimate is **$0.82 for 24 normal-path calls**, before chunking, repairs, malformed-response retries and actual history growth. It assumes three UTF-8 bytes per input token, 3,000 prompt-overhead tokens and 800 output tokens per call. The Arabic second window has two editor chunks; a consolidation call and additional verification/repair can increase this. This estimate is planning, not measured spend.

**Maximum authorization requested: $5 total, 60 attempted calls, at most $0.50 reserved per call.** The harness reserves a conservative byte-based input-token bound plus maximum output cost before each request; refuses before sending if any cap would be exceeded; and keeps unknown outcomes reserved. No transport retries, restart of a prior run directory or automatic reconciliation. Malformed V3 JSON corrective calls consume the same global caps. Any failure stops the run and leaves remaining cases missing. A dedicated provider key with its own $5 account limit is recommended as an independent enforcement layer.

Routing is fixed: `openai/gpt-4.1` edits and repairs; `openai/gpt-4.1-mini` verifies. The single-LLM baseline makes one GPT-4.1 editor request, with no verification, repair, tools or retrieval. Prices checked on the provider's [GPT-4.1 page](https://openrouter.ai/openai/gpt-4.1) ($2/$8 per million input/output tokens) and [mini page](https://openrouter.ai/openai/gpt-4.1-mini) ($0.40/$1.60) on October 27, 2026. Provider model aliases are not immutable model snapshots; the run records requested and provider-returned model identifiers and response IDs. Exact future byte-for-byte model output reproducibility is not guaranteed.

Execution sends retained full source evidence to OpenRouter using a dedicated `BRIEFING_EVAL_OPENROUTER_KEY`. It runs the actual local V3 core engine with replay time set to the window end. It touches no production account ledger, D1, R2, feeds, queues, scheduler, deployment or notifications. Local reservation journaling does not demonstrate production accounting correctness. Raw inputs, requests, responses, reader memory and journals stay ignored under `private/paid-pilot/`. No source evidence is reacquired. The input guard admits complete requests up to 200,000 UTF-8 bytes and articles up to 250,000 characters; actual history can still cause an explicit limit failure. Current V3's existing preparation/deduplication remains observable, rather than being silently changed for this comparison.

The exact execution command, **only after approval of the manifest hash**, is:

```powershell
packages/briefing/node_modules/.bin/tsx.cmd evaluation/briefing-quality/replay.ts --paid evaluation/briefing-quality/private/run-20261027 evaluation/briefing-quality/private/paid-pilot 592b5940e47963f4e22c2f7bc9432347c562409f3c495bd3c9c6721a7388aca0
python evaluation/briefing-quality/runtime.py evaluation/briefing-quality/private/paid-pilot evaluation/briefing-quality/private/run-20261027
```

No paid call has been made. This proposal does not authorize validation or held-out runs, a live product trial or further acquisition.

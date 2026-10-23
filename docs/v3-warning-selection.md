# V3 editorial selection of future developments — 2026-10-23

## Change
One editor selection instruction now explicitly includes consequential, source-supported warnings, threats, plans and official decisions relevant to the reader before execution. It requires preserving attribution, uncertainty and future timing. Routine plans, vague speculation, off-topic claims and unchanged previously reported warnings remain omittable. The same standard applies across output languages.

No verifier, repair, model mapping, article preparation, pipeline stage, scheduler or published edition was changed. No location-specific or company-specific rules were added. English and Arabic remain independent editorial runs; identical coverage is not guaranteed.

## Retained real failure
Frozen fixture `packages/briefing/test/fixtures/v3-warning-selection.json` contains the exact input sources, timestamps, URLs, prior histories, recorded results and source hashes for the 19:47:58 English / 19:48:05 Arabic editions, reporting window ending 19:44:53 Beirut. Both received posts 107633–107636. English included the electricity cutoff and warning of upcoming airstrikes; Arabic included only the electricity cutoff. Arabic explicitly omitted the warning as an intention rather than execution or a new decision. There were no verification drops.

Manual editorial assessment: a consequential imminent warning about the reader's region can deserve inclusion before execution. This does not independently verify the Telegram report or resolve its unusual attribution of a military action statement to a regional council. Accurate reporting must preserve that it is an attributed statement, not establish that the threatened action occurred. Other posts lacking a direct Lebanon connection are not made eligible simply by this change.

## Tests and evidence limits
- The regression first failed because the new selection instruction was absent.
- All 71 briefing tests (13 files) pass after the change.
- Five new tests: source-hash/equivalent-evidence/retained-omission check; English and Arabic real-evidence workflow transport; English and Arabic synthetic controls for meaningful updates, corrections, routine plans, speculation and unchanged warnings.
- Model-port responses in workflow tests are scripted and explicitly labelled. They check prompt/evidence transport, source ownership, history links and unchanged stage count. They do not demonstrate model selection accuracy, reduced omissions or semantic quality.
- Developmental labels are manually assessed, not a held-out quality benchmark. The additional public-safety snippets are synthetic, not real news evidence.
- No external inference calls, additional inference charges or deployment. Previous paid authorizations are not reused. Actual GPT-4.1 compliance and English/Arabic selection consistency under this instruction remain unmeasured.

A future authorized small comparison should hold source evidence, prior histories and model settings fixed, changing only the editor selection instruction. It should check the retained warning plus separate controls for routine/speculative/repeated reporting, material updates and corrections. Do not treat blanket inclusion of all future claims as success or require both languages to use identical prose.
- TypeScript checks passed for the briefing package and Worker; whitespace validation passed.

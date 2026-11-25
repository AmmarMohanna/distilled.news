# V5 generation on the V3 publication path

V5 is an opt-in writer configuration for a source-bound V3 window. The Worker persists the selected model, provider, price ceilings and prompt revision in the same frozen input as current evidence and reader history. The generation profile is attached only to the initial editor request. Consolidation, occurrence novelty, source-bound checks, factual repair and re-verification still use their existing routes.

The profiles under review are `gemini-ai-studio-flex` and `deepseek-flash-wafer`. `BRIEFING_V5_GENERATION_PROFILE` is unset by default. Selecting a profile requires the source-binding flag and existing spending authorization for the precise writer model. There is no provider or model fallback. V3 retains its existing reservation, response checkpoint, recovery and publication fencing.

The editor prioritizes current events before using history to check novelty. Its drafting target is 85% of the established window reading budget. ICU word segmentation counts the final headline and body in the output language. The final gate withholds over-budget copy without truncating it, and repair remains subject to re-verification. Exhausted editor and consolidation contract failures retain affected evidence for a later window.

## Shadow pilot and review procedure

Use frozen, authorized sources and reader history with the local V5 qualification runner. Use Gemini Flex for English or Arabic development checks, and DeepSeek Flash on Wafer for the French pilot. These are explicit trial selections. Leave the feature unset on the production Worker. Any future Worker pilot must use a dedicated test database and archive with reader-facing integrations and credentials absent.

The local runner has an inference transport and writes private artifacts. It has no publication or delivery port. On the Worker, a frozen V5 generation profile stops execution after the private result checkpoint. The request is recorded as `V5_SHADOW_REVIEW_REQUIRED`. This happens before public artifact staging, edition creation and delivery-job creation. The publication validator also rejects V5 inputs. Redelivery of the same window reuses the saved result.

Have an authorized editor open the frozen input and exact reader text together. Record the profile, output digest, source revisions, factual and citation decisions, and a separate editorial-usefulness decision. Check the cited passages, headline strength, pending approvals, time certainty, novelty and the final word budget. Record failures and omissions with the same window ID, including a reason for material stories left out. A review record completes the shadow assessment. It carries no permission to send, publish, or copy the result into reader history.

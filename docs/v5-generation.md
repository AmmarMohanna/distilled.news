# V5 generation on the V3 publication path

V5 is an opt-in writer configuration for a source-bound V3 window. The Worker persists the selected model, provider, price ceilings and prompt revision in the same frozen input as current evidence and reader history. The generation profile is attached only to the initial editor request. Consolidation, occurrence novelty, source-bound checks, factual repair and re-verification still use their existing routes.

The profiles under review are `gemini-ai-studio-flex` and `deepseek-flash-wafer`. `BRIEFING_V5_GENERATION_PROFILE` is unset by default. Selecting a profile requires the source-binding flag and existing spending authorization for the precise writer model. There is no provider or model fallback. V3 retains its existing reservation, response checkpoint, recovery and publication fencing.

The editor prioritizes current events before using history to check novelty. Its drafting target is 85% of the established window reading budget. ICU word segmentation counts the final headline and body in the output language. The final gate withholds over-budget copy without truncating it, and repair remains subject to re-verification. Exhausted editor and consolidation contract failures retain affected evidence for a later window.

The bounded live study produced three engine-ready editions across six attempts. Subsequent source review found errors the engine gate missed. The profiles are suitable for controlled offline or shadow review. Automatic reader delivery requires additional evidence and explicit approval. This change contains no live configuration update.

# Distilled agent runtime — first vertical slice

The canonical model-routing configuration is structured data. Distilled resolves a logical `ModelRole`; the gateway does not choose the role.

```json
{
  "gateway": "openrouter",
  "roles": {
    "NAVIGATION_FAST": {
      "primary": "provider/model-a",
      "fallbacks": ["provider/model-b", "provider/model-c"]
    },
    "VISION_FAST": {
      "primary": "provider/vision-a",
      "fallbacks": ["provider/vision-b"]
    }
  }
}
```

Every configured role uses exactly one non-empty `primary` model reference and an ordered `fallbacks` array. Model and provider names are deployment data, not runtime constants. The default configurable gateway is `openrouter`.

Environment overrides are unambiguous and per role:

```text
DISTILLED_LLM_GATEWAY=openrouter
DISTILLED_MODEL_ROLE_<MODEL_ROLE>_PRIMARY=provider/model-a
DISTILLED_MODEL_ROLE_<MODEL_ROLE>_FALLBACKS_JSON=["provider/model-b","provider/model-c"]
```

`<MODEL_ROLE>` is one of `NAVIGATION_FAST`, `EXTRACTION_FAST`, `VISION_FAST`, `REASONING_STANDARD`, `REASONING_STRONG`, `VISION_STRONG`, `ADAPTER_REPAIR`, or `SEMANTIC_VERIFIER`. An override for the fallback chain must be a JSON string array. Empty entries and duplicate model references are rejected.

The implemented slice keeps stable instructions separate from dynamic `AgentPageState`, observation-delta, budget, challenge, progress, completion-deficit, and capability data. A model response is a schema-validated plan of one to five actions. The deterministic controller decides whether each next action can continue without another model call. Exact response reuse is deliberately disabled; the immutable context-manifest hash and `allowExactReuse` seam exist for a later proof of safe reuse.

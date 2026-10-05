# OpenRouter staging proof — 2026-10-05

Starting integration HEAD: `945e3b4ae20138cc13684f027fb4051a99c3ad44`.
Only `integration/staging-end-to-end-v1` and `distilled-news-staging` were changed. Main and production were untouched.

## Credential and configuration

The owner installed `OPENROUTER_API_KEY`. Its name was verified through the
connected staging account; its value was never retrieved, logged, or committed.
OpenRouter authenticated and returned four successful, usage-confirmed synthesis
responses using `openai/gpt-4.1-mini`. Total reported cost was **$0.0091788**.
There were no successful GROUNDING calls and no model-generated edition.

Paid source ceilings stayed `{"twitterApiIo":0,"apify":0,"zyte":0}` throughout.
The Twitter D1 budget stayed zero. Existing retained evidence was reused; the
cumulative source paid-operation count remained one.

Scheduling was temporarily paused for the proof. Cloudflare cron changes did
not propagate immediately. One ordinary scheduled Twitter window also reached
synthesis during this interval; it is included in the four-call total below.
Dispatch was temporarily disabled while inspecting contention, then restored.

## Changes

- `58c4e9b`: removes duplicate fact bodies and internal graph IDs from the
  communication payload, while retaining approved facts, attribution, certainty,
  temporal fields, and exact EvidenceRevision support. Verification retains the
  full internal correctness state and a compact approved-fact inventory.
- The same commit makes read-only Feed transactions validate the CAS guard
  without advancing the Feed epoch. Real writes and source changes still fence
  stale snapshots. This prevents repeated no-op dispatcher checks from starving
  selection. The synthesis execution clock starts after its lease is claimed;
  the existing lease and 60-second execution limit remain enforced.
- `5c1bb82`: offers schema-constrained short story IDs to the writer and maps
  only recognized IDs back to exact durable candidate IDs. EvidenceRevision IDs
  and quotes remain unchanged. Prompt version is
  `approved-fact-spans-editorial-v8`; the writer is explicitly told to combine
  facts within the four-claim limit instead of dropping MUST_INCLUDE facts.

No migrations, correctness guards, ceilings, test timeouts, or source ownership
rules were relaxed.

## Live results

| Edition/window identity | Synthesis cost | Result |
| --- | ---: | --- |
| `edafe4cb70881520ae1b43c2e35186e96cb74fdb63bf2a00e667911e27698cd8` | $0 | Broad downstream attempt failed before any model call. |
| `8c31656ef8bf73295922ff1c018ce45e92ff604f0174803c3af2c82116549c7c` | $0.0020168 | Scheduled window; synthesis succeeded, publication failed closed. |
| `d5183a3a5f01579c368e4d574acacd35e42025bd0964492008c44c7a8b0d2b74` | $0.0030624 | Initial compact-window attempt; synthesis succeeded, publication failed closed. |
| `4145e6e1be6f9eee102a06bbe9e0c93c6c2ebf116b1f4cf4adba18808665e990` | $0.0021296 | Compact v7 writer draft altered a canonical candidate ID and omitted a required fact; rejected before GROUNDING. |
| `c68e796ad8cc09a531eaf606582963a7aafc0a25be2733cc1c6b5605a5037932` | $0.0019700 | v8 IDs mapped correctly. An assembled quote changed source whitespace; literal support validation rejected it before GROUNDING. Review also found an unapproved October 1 date in reader prose. |

The model-based writer is therefore **authenticated but not proven through
verification/publication**. No unsafe draft became public. The earlier approved
deterministic edition remains published:
`1f0a78b598087ebd59a7e763f011fc31b4b74538fd332c333a18354715df3a4b`.
Failed request/job and immutable draft records were retained; history was not
reset to force another publication.

Final Twitter state: 20 EvidenceRevisions, 20 Events, 20 Storylines, one edition,
one cumulative paid source operation. No new Twitter fetch or canonical
intelligence effect occurred.
The existing edition API returned HTTP 200, 2,798 bytes, with its unchanged
SHA-256 `34a5537d60a7306a9a280d63c84a2ab463d3823de1d30a17e7fb85607dbf310d`.

## Verification and final staging state

- Focused approved-synthesis/store/writer/model tests: 21 passed.
- Publication/runtime/preservation/fidelity/scoring/connector runtime run:
  41 passed, one existing 5-second publication restart timing failure.
  The failing test passed unchanged in isolation; no timeout was increased.
- Model identity and writer-plan tests after v8: nine passed.
- Workspace typecheck, staging dry-run build, and `git diff --check` passed.
- Final bundle SHA-256:
  `96c8ceed1f117b3be13ec4f7f038af7f6e7849499b63054ee943bdd88c833cfa`.
- Final staging version: `49600b01-7c86-4783-b3e2-9c82a305d4c8`.
- Deployment: `4eee9a83-b067-4900-9973-b415ce375763`.
- `V1_SYNTHESIS_MODEL_ENABLED=false`; semantic and salience policies remain
  DETERMINISTIC. OpenRouter routing/model settings are retained for a future
  explicitly bounded proof.
- Downstream source IDs restored to RSS and Twitter; the minute cron restored.
- All five secret names were preserved, including `OPENROUTER_API_KEY`.
- D1/R2/queue/VPC remain the previously verified new staging resources.

Further live writer work must preserve exact quote boundaries and approved
information, and must not repeatedly buy inference simply to obtain publication.

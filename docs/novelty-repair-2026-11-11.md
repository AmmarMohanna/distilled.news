# Lebanon feed duplicate-story repair

The 03:00 UTC edition input retained 23 prior stories and 538 articles. Replaying
the actual memory selector showed that G7 was selected but the earlier internet
network order was excluded from the 16-item source-language similarity selection.
The published G7 text was identical; the internet order was paraphrased without
a consequential change.

New V3 inputs now freeze `noveltyGuard:true` in their fingerprint. Retained inputs
without this flag keep their original request bytes. The guard rejects exact
published-text repeats, retrieves memory per drafted reader-language item, and
asks the editor model for a separate complete novelty decision before factual
verification. An omitted/invalid novelty decision fails closed. Duplicate drops
are marked `carry:false`.

User-authorized OpenRouter replay used retained public-feed source articles and
prior briefings, GPT-4.1 editing/novelty and GPT-4.1-mini verification. The first
candidate (memory retrieval plus verifier instruction alone) failed: it still
published the internet repeat. The revised separate novelty decision rejected it.
Both replays retained the synthetic material-update control (proposal adopted,
deadline changed from three to six months). G7 was omitted in the focused real
replays; exact-repeat rejection is separately covered by a deterministic test.

Total provider-reported spend: $0.0497448 across 12 calls, under the approved $2.
Local private artifacts under `.local-reports/novelty-repair/` retain frozen input,
requests, provider responses and budget journals. They are not committed.

These focused results demonstrate the observed failure and a successful repair,
not universal novelty accuracy or a full 538-article end-to-end replay. Semantic
novelty remains a model judgment. The extra editor-model call adds latency and
cost only when drafts and prior reader history exist.

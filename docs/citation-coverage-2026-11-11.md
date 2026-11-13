# Combined-story source coverage

The editor already requested all references for one development, and V3's edition
and public-read projections retained every returned reference. The unchecked gap
was an editor selecting only one of several supporting articles.

New snapshots freeze `citationCoverage:true`. After novelty filtering and before
fact verification, bounded sequential source chunks are matched against the final
drafts by the editor model. Every supplied source must receive one assignment
decision, including an empty list for unrelated/contradictory sources. Unknown
references, missing decisions and invalid story indices fail closed. Existing
citations remain, matched supporting references are added, and the expanded
source set goes through the existing verifier. Merged article `alsoIds` continue
to expand into all original evidence identities in the final result.

Historical snapshots without the flag retain their original request bytes.
One-source cases, and a single draft already citing all sources, need no extra
audit call. Other cases add one model call per existing editor-sized source chunk.

Validation: all 339 briefing tests passed, including two coverage regressions.
A real GPT-4.1 call with synthetic sources assigned both outlets covering the same
approved airport terminal, excluding an unrelated railway proposal and a separate
unapproved terminal. Cost $0.001072; cumulative authorized evaluation spend
$0.0508168 of $2. This checks the association mechanism, not universal model accuracy.
Private response and accounting artifact: `.local-reports/novelty-repair/citation-live.json`.

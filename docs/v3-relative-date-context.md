# Clarify the verifier's relative-date reference

The user identified inconsistent wording: the editor anchors relative dates **in source text** to the source's publication date, while one verifier sentence said relative dates use the briefing cutoff without naming which text it meant. The surrounding verifier instructions also allowed source “today” to become a correctly anchored calendar date, making the sentence internally ambiguous.

New V3 windows now use an explicit distinction:

- Relative dates in **SOURCE text** use that source's supplied publication date, unless the source explicitly gives another reference time.
- Relative dates in the **reader-facing ITEM** use the briefing reporting cutoff.
- Correctly derived calendar dates remain acceptable. Publication metadata alone still cannot establish the timing of a separately described event.

For example, a source published October 22 saying “announced today; inspections begin tomorrow” supports October 22 and October 23. Copying “today” into an October 24 briefing would change the date. A correctly dated concise paraphrase must not be rejected for omitting the source's relative wording.

Only the ambiguous verifier sentence changes. The editor, repair instructions, source text, date storage, schedule, output format and call count are unchanged. There is **no deterministic reader-copy filter**. Existing frozen windows retain their original verifier bytes through the existing version mechanism; newly frozen windows use version 3. This protects durable paid-operation identity and recovery.

Validation: 92 briefing tests and 29 focused Worker V3 runtime/window/recovery tests passed. Briefing and Worker typechecks passed. New tests check the explicit prompt distinction, exact evidence and cutoff presentation, unchanged two-call flow and legacy prompt retention. These are offline contract/integration checks, not evidence of improved live-model accuracy. No paid requests or deployment were performed.

# Source health display correction, 28 October 2026

The public feed had no current collection blockers at the predeployment check,
but ten sources had saved failed item records. The reader treated any saved
failure count as an active outage and expanded all diagnostics into one warning.

The reader now separates current collection problems from retained item outcomes.
Only an unavailable collection source or a nonretrying collection failure produces
a compact warning. Automatic capacity/rate/temporary waits and item-level failure
history remain accessible in a native, collapsed `Source details` disclosure.
The disclosure explains that saved failures and rejected index pages do not
necessarily mean a source is unavailable now. Actual paid collection blocks remain
warnings; unresolved paid item receipts remain in saved diagnostics. No failure
records, billing holds, source settings, model grants or backend health fields
were changed or removed.

New copy includes French and Arabic. Disclosure styles inherit the existing theme,
wrap long source text and add no fixed card dimensions or logo size changes.
Four component regressions verify: saved failures do not create outage banners;
real collection/payment blocks still warn; automatic waits stay in details; and
healthy sources render no diagnostic UI. Frontend typecheck/build passed.

# Structured-output reference compatibility correction — 19 October 2026

Root cause: article-first construction added a description beside structuralRelation's enum $ref after enum sharing. OpenRouter/OpenAI rejected the serialized response schema before GPT execution. The prior admission checker validated the reference target but did not reject sibling keywords.

Correction: remove only that description from construction schema generation. Article-first semantic instructions remain byte-for-byte unchanged. The enum target, all branches, reference capabilities, required-key ClaimMention disposition and provenance/ownership gates remain unchanged. Admission now rejects unsupported $ref siblings before provider transport; definitions containers remain permitted alongside root references.

Five new tests capture and inspect the actual JSON body emitted by createStrongSemanticModel / boundedCompletion. Both empty-candidate and candidate-bearing requests are recursively audited: references resolve and have no siblings, objects are closed with complete unique required fields, E/L/G/C capabilities and relation branches are intact, and optional enrichment stays absent. Description, type and enum sibling injections are blocked with zero transport calls. Tests first failed before the correction, then passed. Complete serialized schema inspection found no other incompatibility in these construction cases. This is offline compatibility evidence, not a provider execution result.

38 focused tests passed, including existing provider schema limits and historical failed-response replay. Repository-wide typechecks and explicit staging dry-run passed. No prompt, model, matching, publication memory, financial rule, inference stage or repair limit changed. The user subsequently authorized pushing/deploying and one fresh private attempt; its outcome is recorded separately.


## Follow-up exposed by the single live test

The corrected construction request executed successfully. Publication then stopped before paying the V2 editorial planner: INVALID_REQUIRED. Its cloned SELECT/OMIT branches retained a shared required-array identity; appending validation/editorialImportance in both branches inserted each twice. Offline inspection of the exact saved publication shortlist reproduced the duplicates in both branches.

Narrow follow-up: assign each branch its own required array, retaining validation/editorialImportance exactly once and preserving every other field. Two added provider-body capture tests (empty and nonempty candidates) reproduced the failure before the fix and pass afterward. The full serialized bodies retain closed objects, resolved references and all mandatory fields. The exact saved publication schema now has fits=true, violations=[], duplicateRequired=[]. No prompt or semantic rule changed.

36 follow-up focused tests passed; repository-wide typechecks and the explicit staging dry-run passed again. This follow-up is pushed but NOT deployed or exercised with paid inference; the authorized live scope was already consumed. The full live outcome and grouping concerns are recorded separately.

# Manual versus Distilled study protocol

Use the current [human handoff](HANDOFF.md), `templates/observations.csv` and `study.py` for execution and analysis. The older `templates/study.csv`/`suite.py study` preserve the initial experiment only. Six multilingual draft task packs are in `private/challenges-current/study-packs/`; all need full-body human answer keys and A/B story/difficulty certification before participants. Distilled material additionally needs an actual frozen V3 output. No participant has been recruited or observed. The handoff supplies multilingual consent/screening drafts, exact four-way counterbalancing and required fields for valid pairing.

## Target and recruitment

Target multilingual university students and early-career researchers in Lebanon who monitor a topic at least three times per week using multiple news sources. This is a proposed recruitable group, not a claim about existing customers. Screen for actual monitoring behavior and language proficiency; exclude project contributors from the primary analysis. Aim for 6–10 consenting adults, with at least two competent participants per assessed language. Findings remain exploratory and are not population estimates.

Explain the purpose, voluntary participation, right to stop, what is recorded and how pseudonymous records will be stored. Ask separately before recording audio; notes are sufficient. Avoid collecting names in analysis files. Store consent/contact information separately from task results. Agree a retention/deletion date with participants and any applicable university requirements before recruitment. No invitations or external messages have been sent.

## Interview (10–15 minutes)

1. Describe the last time you monitored a topic: sources, frequency and purpose.
2. What did you need to know, and what action depended on knowing it?
3. How do you notice updates, verify reports and handle conflicting information?
4. What information gets missed or repeated? How much time does monitoring take?
5. Which languages do you read comfortably? What makes a briefing trustworthy/useful?

Use answers to refine realistic tasks before freezing the study, not to retroactively select favorable outcomes.

## Task design and counterbalancing

Prepare two matched development-only evidence packs A/B per language with comparable article volume, reading burden and adjudicated key developments. Human reviewers must certify the answer key and difficulty first. Do not reuse held-out quality cases as participant practice material. Give everyone a short separate practice task.

Assign participants cyclically to four sequences: manual A → Distilled B; Distilled B → manual A; manual B → Distilled A; Distilled A → manual B. This balances both condition order and pack assignment. Manual condition: full article list/body viewer, no generated briefing. Distilled condition: its frozen briefing plus identical source evidence and source access. Use the same device/time limit (proposed 12 minutes per task) and questions. This is a controlled retained-evidence comparison, not a live web monitoring study; label it accordingly.

Task: identify the three most consequential developments for the stated interests, describe what changed, provide source evidence, identify unresolved uncertainty, and answer 3–5 fact/comprehension questions. For novelty tasks provide identical initial published context in both conditions. Participants may open sources in either condition. Record all source-checking time as task time.

## Measurements

Use `templates/study.csv`, one row per participant/condition/pack. Record language, order, elapsed seconds, success, missed/expected key facts, correct/total comprehension answers, usefulness 1–5, effort 1–5 (higher harder), source opens, and notes. A timed-out task gets elapsed limit, success=false and its actual answers; a withdrawal is recorded with missing metrics and a reason, never silently dropped. Do not fill any row without observation.

After each condition ask: How useful was this for your task? How much effort did it require? What was hard to understand or verify? After both ask which workflow they would choose, why, and what must improve. Record contrary opinions and trust failures.

## Analysis and report

Report recruitment/screening, language proficiency, condition assignment, task materials, missingness and withdrawals. Calculate within-person differences for matched conditions: seconds, missed-fact rate, comprehension, usefulness and effort. Show individual paired results and median differences with ranges; a small study does not justify broad significance claims. The script reports descriptive condition/language summaries; paired interpretation requires complete comparable participant pairs. Separate language groups and mention repeated multilingual participants. Treat self-reported usefulness and observed comprehension as different outcomes.

Code interview notes into monitoring needs, time savings, omissions, verification, trust, language issues and suggested changes. Preserve disconfirming examples. Summarize limitations: small convenience sample, controlled historical evidence, learning effects, differing pack difficulty, and prototype failures. Prioritize improvements by severity, frequency and implementation scope; validate changes on development/validation before final held-out use.

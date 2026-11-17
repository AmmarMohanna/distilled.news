# Publication-date admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Stop already-resolved unchanged evidence returning through missed windows while preserving dated news and explicit recovery.
**Architecture:** Expose retry and resolution state from the existing candidate-indexed carry lookup; use it in V3 preparation and persist admission reasons only on newly frozen snapshots.
**Tech Stack:** TypeScript, Workers, D1, Vitest/Miniflare, existing staging Wrangler target.
**Spec:** docs/superpowers/specs/2026-11-13-publication-date-admission.md

## Global Constraints
Preserve original publication dates, source scope/visibility, immutable frozen inputs, paid identities and receipts. No new spend/editorial quotas. Retain uncertainty, verification retries, unresolved/unaccounted sources and valid late evidence.

## Review Focus
Verified but unpublished sources must survive; future results cannot suppress earlier recovery; missing/backfill schemas remain correct; same-result retry wins over omission; indexed decisions must remain generation-consistent.

### Task 1: Regression and decision state
- [x] Reproduce skipped/omitted/redundant evidence returning through superseded windows in v3-window.test.ts.
- [x] Expose retry and resolved state from store.ts through a shared evidence-window-decisions.ts helper, preserving carryEvidenceIds behavior.
- [x] Test indexed/fallback scope, chronological cutoff, unpublished selection and retry precedence.

### Task 2: Admission policy
- [x] Filter resolved unchanged revisions in prepareV3Window; retain publication-date classification and legitimate recovery.
- [x] Record admission policy/reasons on new inputs; leave frozen inputs unchanged.
- [x] Run date, source revocation, carry, scaling, V3 and paid-replay regressions plus TypeScript/build.

### Task 3: Live proof and deployment
- [x] Compare real staging candidates and publication dates using read-only preparation; preserve all financial records.
- [x] Obtain a separate code review, commit, push and deploy the existing staging target.
- [x] Verify live reads and new-policy input behavior; record measured effects and remaining uncertainty.

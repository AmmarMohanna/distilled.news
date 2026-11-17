# Applying the Chapter 4 and Chapter 5 revisions

## Replace exactly these two files

| Report chapter | Existing LaTeX filename |
|---|---|
| Chapter 4: Constraints and Applicable Standards | 7_Technical_NonTechnicalConstraints_Standards.tex |
| Chapter 5: Progress and Preliminary Validation | 8_ProgressDescription.tex |

Replace the complete contents of each file with the corresponding revised file. Do not append the new text after the old chapter. The numbers in these filenames are not chapter numbers: 4_Introduction.tex and 5_TechnicalBackground.tex are Chapters 1 and 2 and are unchanged.

The revised ZIP contains the complete original project with only those two source files changed. Alternatively, upload only the two replacement .tex files to your existing Overleaf project.

## Main document: no edits required

Keep 0_MainDocument.tex as the main document. It already includes:

```latex
\include{7_Technical_NonTechnicalConstraints_Standards}
\include{8_ProgressDescription}
```

Keep both commands in the same positions. Do not add another chapter command in the main file.

The existing preamble already supplies longtable, tabularx, booktabs, array, hyperref, and the custom L column type. No new package or bibliography entry is required.

Recompile the complete main document, including the bibliography. On Overleaf use Recompile, or Recompile from scratch if old table-of-contents entries remain. With a conventional local TeX installation:

```text
pdflatex 0_MainDocument.tex
bibtex 0_MainDocument
pdflatex 0_MainDocument.tex
pdflatex 0_MainDocument.tex
```

## What changed

### Chapter 4

- Uses simpler explanations of the actual technical and non-technical constraints.
- Connects each constraint to its design response and verification.
- Identifies the two-slot/60-second helper settings as QA configuration, not Cloudflare platform limits.
- States approximately US$500/month for 1,000 configured feeds as a planning objective, not an achieved cost.
- Explains that source count, collection frequency, fallback rates, and workload determine cost and capacity.
- Distinguishes formal standards from guidance and makes no certification claim.
- Retains the chapter label chap:constraints and the table label tab:techconstr used by the rubric appendix.

### Chapter 5

- Separates design alternatives, implemented components, measured experiments, live acquisition results, evaluation preparation, and remaining work.
- Preserves the current V3 editor -> verifier -> targeted repair when needed -> persistence workflow.
- Separates synthetic database preparation, real-source replay, live canary observations, and planned human evaluation.
- Keeps costs and timings tied to their actual workloads.
- Includes the October 31 acquisition snapshot and the confirmed unpaid article recoveries.
- Explains that the acquisition backlog remains unresolved; it does not claim successful 1,000-feed live operation.
- Keeps R01-R16 traceability and makes unmet targets explicit.
- Removes the unavailable Figures/v3_evidence.png reference. No replacement image is required.
- Retains chap:progress, tab:alternatives, tab:results, tab:traceability and tab:risks.

## Grading criteria covered

- Technical constraints: Section 4.1.
- Non-technical constraints: Section 4.2.
- Applicable standards: Section 4.3; the existing resources appendix remains unchanged.
- Design alternatives and justification: Section 5.2.
- Implementation progress: Section 5.3.
- Preliminary testing and interpretation: Sections 5.4-5.6.
- Requirement status and acceptance work: Section 5.7.
- Remaining risks and corrective plan: Section 5.8.

The executive summary, introduction, literature review, methodology, conclusion, resources, schedule, minutes, bibliography, and rubric appendix were not edited. Their factual updates remain a separate team review; these revisions do not certify the entire report or guarantee a grade.

## Evidence boundaries

The report uses your supplied report, grading rubric, existing bibliography, retained project reports, and the QA observations from this chat.

The latest acquisition figures are a dated snapshot at 09:26 UTC on October 31, 2026, not a current dashboard counter or a count of unique articles. Earlier evaluations retain their original source populations. Test totals from different branches overlap and are not summed as unique tests. Human accuracy, participant benefit, and a sustainable 1,000-feed cost/latency result remain unproved.

The chapters-only PDF is extracted from a compilation of the complete project, so chapter numbers, citations, and references correspond to the complete revised report. It is a reading preview; submit the full project according to the course requirements.

# FYP technical report

The [LaTeX project](latex/0_MainDocument.tex) is the report source retained in the repository, including its bibliography, figures, minutes template and rubric appendix. The [Chapters 4 and 5 PDF](Chapters_4_and_5_Revised.pdf) is a reading preview of the revised constraints and progress chapters. Use the complete project for a full report compile. Review the remaining chapters for submission currency and consult the [November evaluation evidence](../README.md#evaluation-and-evidence).

## Build the full document

Open `latex/0_MainDocument.tex` as the main document in Overleaf, or change into `docs/report/latex` and run with a TeX distribution that provides the packages in the preamble:

```sh
pdflatex 0_MainDocument.tex
bibtex 0_MainDocument
pdflatex 0_MainDocument.tex
pdflatex 0_MainDocument.tex
```

Chapter 4 uses `7_Technical_NonTechnicalConstraints_Standards.tex`. Chapter 5 uses `8_ProgressDescription.tex`. Both revised files are already included in the canonical project. The report ties technical and non-technical constraints to verification, records requirements R01–R16, and separates measured work from planned validation. Counts and cost targets remain scoped to the workloads and dates stated in the relevant chapters. The [original revision notes](https://github.com/AmmarMohanna/distilled.news/blob/e5f4ffb2e72916d10d5aa53191dbbb112d5ead0e/output/pdf/report-chapters-4-5/LATEX_CHANGES.md) provide provenance for that revision.

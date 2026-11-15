# Detailed fault-detection tables

Unknown references are masked. Failed and uncertain judgments remain explicit; translations share event groups. P/R/F1 are conditional on completed decisive judgments.

## synthetic: gpt

| Category | N | TP | FP | TN | FN | Failed +/− | Abstained +/− | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| factual | 24 | 3 | 0 | 21 | 0 | 0/0 | 0/0 | 100.0% | 100.0% | 100.0% |
| citation | 24 | 3 | 0 | 21 | 0 | 0/0 | 0/0 | 100.0% | 100.0% | 100.0% |
| coverage | 3 | 2 | 0 | 0 | 0 | 1/0 | 0/0 | 100.0% | 100.0% | 100.0% |
| relevance | 24 | 3 | 0 | 21 | 0 | 0/0 | 0/0 | 100.0% | 100.0% | 100.0% |
| repetition | 24 | 2 | 0 | 21 | 0 | 1/0 | 0/0 | 100.0% | 100.0% | 100.0% |
| temporal | 24 | 3 | 0 | 21 | 0 | 0/0 | 0/0 | 100.0% | 100.0% | 100.0% |
| language | 24 | 2 | 0 | 17 | 0 | 0/0 | 1/4 | 100.0% | 100.0% | 100.0% |

| Requested language | N | TP | FP | TN | FN | Failed +/− | Abstained +/− | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 14 | 6 | 0 | 4 | 0 | 0/0 | 1/3 | 100.0% | 100.0% | 100.0% |
| ar | 14 | 6 | 0 | 6 | 0 | 1/0 | 0/1 | 100.0% | 100.0% | 100.0% |
| fr | 14 | 6 | 0 | 7 | 0 | 1/0 | 0/0 | 100.0% | 100.0% | 100.0% |


## synthetic: claude

| Category | N | TP | FP | TN | FN | Failed +/− | Abstained +/− | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| factual | 24 | 3 | 1 | 20 | 0 | 0/0 | 0/0 | 75.0% | 100.0% | 85.7% |
| citation | 24 | 3 | 1 | 20 | 0 | 0/0 | 0/0 | 75.0% | 100.0% | 85.7% |
| coverage | 3 | 3 | 0 | 0 | 0 | 0/0 | 0/0 | 100.0% | 100.0% | 100.0% |
| relevance | 24 | 3 | 0 | 21 | 0 | 0/0 | 0/0 | 100.0% | 100.0% | 100.0% |
| repetition | 24 | 3 | 0 | 21 | 0 | 0/0 | 0/0 | 100.0% | 100.0% | 100.0% |
| temporal | 24 | 1 | 0 | 21 | 2 | 0/0 | 0/0 | 100.0% | 33.3% | 50.0% |
| language | 24 | 2 | 0 | 17 | 0 | 0/0 | 1/4 | 100.0% | 100.0% | 100.0% |

| Requested language | N | TP | FP | TN | FN | Failed +/− | Abstained +/− | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 14 | 6 | 0 | 4 | 0 | 0/0 | 1/3 | 100.0% | 100.0% | 100.0% |
| ar | 14 | 7 | 1 | 6 | 0 | 0/0 | 0/0 | 87.5% | 100.0% | 93.3% |
| fr | 14 | 7 | 0 | 7 | 0 | 0/0 | 0/0 | 100.0% | 100.0% | 100.0% |


## real-source: gpt

| Category | N | TP | FP | TN | FN | Failed +/− | Abstained +/− | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| factual | 12 | 6 | 0 | 6 | 0 | 0/0 | 0/0 | 100.0% | 100.0% | 100.0% |
| citation | 6 | 0 | 0 | 6 | 0 | 0/0 | 0/0 | unknown | unknown | unknown |
| coverage | 0 | 0 | 0 | 0 | 0 | 0/0 | 0/0 | unknown | unknown | unknown |
| relevance | 6 | 0 | 0 | 6 | 0 | 0/0 | 0/0 | unknown | unknown | unknown |
| repetition | 6 | 0 | 0 | 6 | 0 | 0/0 | 0/0 | unknown | unknown | unknown |
| temporal | 6 | 0 | 0 | 6 | 0 | 0/0 | 0/0 | unknown | unknown | unknown |
| language | 6 | 0 | 0 | 4 | 0 | 0/0 | 0/2 | unknown | unknown | unknown |

| Requested language | N | TP | FP | TN | FN | Failed +/− | Abstained +/− | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 4 | 2 | 0 | 1 | 0 | 0/0 | 0/1 | 100.0% | 100.0% | 100.0% |
| ar | 4 | 2 | 0 | 2 | 0 | 0/0 | 0/0 | 100.0% | 100.0% | 100.0% |
| fr | 4 | 2 | 0 | 1 | 0 | 0/0 | 0/1 | 100.0% | 100.0% | 100.0% |


## real-source: claude

| Category | N | TP | FP | TN | FN | Failed +/− | Abstained +/− | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| factual | 12 | 6 | 0 | 6 | 0 | 0/0 | 0/0 | 100.0% | 100.0% | 100.0% |
| citation | 6 | 0 | 1 | 5 | 0 | 0/0 | 0/0 | 0.0% | unknown | 0.0% |
| coverage | 0 | 0 | 0 | 0 | 0 | 0/0 | 0/0 | unknown | unknown | unknown |
| relevance | 6 | 0 | 0 | 6 | 0 | 0/0 | 0/0 | unknown | unknown | unknown |
| repetition | 6 | 0 | 0 | 6 | 0 | 0/0 | 0/0 | unknown | unknown | unknown |
| temporal | 6 | 0 | 0 | 6 | 0 | 0/0 | 0/0 | unknown | unknown | unknown |
| language | 6 | 0 | 0 | 4 | 0 | 0/0 | 0/2 | unknown | unknown | unknown |

| Requested language | N | TP | FP | TN | FN | Failed +/− | Abstained +/− | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 4 | 2 | 1 | 1 | 0 | 0/0 | 0/0 | 66.7% | 100.0% | 80.0% |
| ar | 4 | 2 | 0 | 2 | 0 | 0/0 | 0/0 | 100.0% | 100.0% | 100.0% |
| fr | 4 | 2 | 0 | 1 | 0 | 0/0 | 0/1 | 100.0% | 100.0% | 100.0% |


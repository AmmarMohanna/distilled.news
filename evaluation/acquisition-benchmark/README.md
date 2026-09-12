# Distilled.news Acquisition Benchmark

This package implements the acquisition benchmark described by the v1.2 runbook. It is separate from the production application so routes can be measured against identical inputs and limits without coupling provider-specific behavior to the Worker.

The first implemented boundary contains:

- common `FetchAttempt` records;
- public HTTP/HTTPS target validation;
- DNS-result validation that rejects a hostname if any answer is non-public;
- tests that do not contact external sites.

## Local development

```bash
python -m venv .venv
python -m pip install -e ".[dev]"
python -m pytest
```

Provider credentials and raw benchmark data must remain outside Git.

#!/usr/bin/env bash
set -euo pipefail
benchmark_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$benchmark_dir"
python3 -c 'import sys; assert sys.version_info >= (3,12), "Python 3.12+ required"'
node -e 'if (+process.versions.node.split(".")[0] < 24) throw Error("Node 24+ required")'
python3 -m venv .venv
.venv/bin/python -m pip install -c constraints.txt -e '.[dev,sources,extract,browser]'
npm ci --prefix node --ignore-scripts --no-audit --no-fund
.venv/bin/python -m playwright install chromium
.venv/bin/python -m pytest
.venv/bin/python -m bench preflight --config configs/offline-demo.json
printf '%s\n' 'Setup complete. Configure real inputs, credentials, independent references and caps before live runs.'

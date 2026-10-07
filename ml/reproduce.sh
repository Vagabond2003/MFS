#!/usr/bin/env bash
# Rebuilds everything behind the churn model and the fairness check, from nothing:
#   bash ml/reproduce.sh            (or: npm run ml)
# 1. large synthetic dataset      → data/large/          (gitignored; offline only, never a database)
# 2. churn training table         → data/churn/features.csv
# 3. train + evaluate + export    → src/services/mock/intelligence/churn-model.json, tests/fixtures/churn-parity.json,
#                                   ml/reports/metrics.*, docs/evaluation.md (metrics section)
# 4. fairness check               → ml/reports/fairness.*, docs/evaluation.md (fairness section)
# Fixed seeds throughout: a re-run gives the same numbers. Set TRAINED_AT=YYYY-MM-DD to pin the training date too.
# Needs Node 22.18+ and Python 3.11+.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -x ml/.venv/bin/python ]; then
  python3 -m venv ml/.venv
fi
ml/.venv/bin/pip install --quiet -r ml/requirements.txt

NODE="node --max-old-space-size=8192"
$NODE scripts/generate-large.mjs
$NODE scripts/churn-dataset.mjs
ml/.venv/bin/python ml/train.py
$NODE scripts/fairness.mjs > /dev/null
echo "Done. Run npm test to check the TypeScript scorer against the new model (tests/churn-model.test.ts)."

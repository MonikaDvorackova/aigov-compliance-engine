#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not in a git repository"
  exit 2
fi

BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" == "main" ]]; then
  echo "Refusing to run on main. Create a branch first."
  echo "Example: git switch -c fix/pr-prepare"
  exit 2
fi

echo "Ensuring audit service is running"
make audit_bg >/dev/null
make status

RUN_ID="$(make new_run)"
export RUN_ID
echo "RUN_ID=$RUN_ID"

make flow_full RUN_ID="$RUN_ID" AIGOV_EVAL_VALUE="${AIGOV_EVAL_VALUE:-1.0}"

echo "Staging required audit artifacts"
git add \
  "docs/reports/$RUN_ID.md" \
  "docs/audit/$RUN_ID.json" \
  "docs/packs/$RUN_ID.zip"

if ! git diff --cached --quiet; then
  git commit -m "Add audit report for RUN_ID=$RUN_ID"
else
  echo "Nothing to commit for audit artifacts"
fi

echo "Next steps"
echo "1) git add -A   (add your code changes, if not added yet)"
echo "2) git commit -m \"Your change\""
echo "3) git push -u origin HEAD"
echo "4) Open PR"

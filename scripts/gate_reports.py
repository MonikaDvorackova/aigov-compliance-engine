#!/usr/bin/env python3
"""CI gate: audit reports must include required markdown sections.

Required headings are the exact strings below (substring match). New reports should use
exact level-2 headings "## Evaluation gate" and "## Human approval gate" on their own lines.
"""
from pathlib import Path

req = ["## Evaluation gate", "## Human approval gate"]
report_dir = Path("docs/reports")
files = list(report_dir.glob("*.md"))

if not files:
    print("gate: no reports found; OK")
    raise SystemExit(0)

missing = []
for p in files:
    txt = p.read_text(encoding="utf-8")
    for r in req:
        if r not in txt:
            missing.append((str(p), r))

if missing:
    print("gate FAIL; missing required sections:")
    for f, r in missing[:50]:
        print(f" - {f} missing {r}")
    raise SystemExit(1)

print(f"gate OK; checked {len(files)} reports")

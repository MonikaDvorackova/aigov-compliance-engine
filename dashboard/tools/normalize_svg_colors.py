#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path


RGBA_RE = re.compile(
    r"rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([01](?:\.\d+)?)\s*\)",
    re.IGNORECASE,
)


def clamp255(n: int) -> int:
    return max(0, min(255, n))


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def fmt_float(x: float) -> str:
    s = f"{x:.4f}".rstrip("0").rstrip(".")
    return s if s else "0"


def replace_rgba_in_attr(text: str, attr: str, opacity_attr: str) -> str:
    pattern = re.compile(rf'({attr}\s*=\s*")([^"]*)(")', re.IGNORECASE)

    def repl(m: re.Match[str]) -> str:
        before = m.group(1)
        value = m.group(2)
        after = m.group(3)

        mm = RGBA_RE.fullmatch(value.strip())
        if not mm:
            return m.group(0)

        r = clamp255(int(mm.group(1)))
        g = clamp255(int(mm.group(2)))
        b = clamp255(int(mm.group(3)))
        a = clamp01(float(mm.group(4)))

        rgb = f"rgb({r},{g},{b})"
        return f'{before}{rgb}{after} {opacity_attr}="{fmt_float(a)}"'

    return pattern.sub(repl, text)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True, help="Input SVG path")
    ap.add_argument("--out", dest="out", required=True, help="Output SVG path")
    args = ap.parse_args()

    inp = Path(args.inp)
    out = Path(args.out)

    s = inp.read_text(encoding="utf-8")

    s = replace_rgba_in_attr(s, "stop-color", "stop-opacity")
    s = replace_rgba_in_attr(s, "fill", "fill-opacity")
    s = replace_rgba_in_attr(s, "stroke", "stroke-opacity")

    out.write_text(s, encoding="utf-8")

    print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
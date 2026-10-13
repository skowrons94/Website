#!/usr/bin/env python3
"""
The evaluated rates the explorer can switch to (a reaction's `alternatives`
in public/rates/<id>.json), and whether they ship.

The "Use the LUNA/AZURE2 rates" switch is built but hidden while
LUNA_RATES_PUBLIC (lib/rates/features.ts) is false. Hidden must mean absent
from the site: the network files then carry no `alternatives` (no tables, no
paper, no method), and test:rates rebuilds them from scripts/rates/evaluated/
(scripts/rates/test.mjs: withAlternatives mirrors evaluated_rate below).
build.py applies this to every network it writes.

Run on its own, it applies the flag to the committed network files without
pynucastro (needed only to rebuild them from REACLIB), leaving every other
byte as it was:

    python scripts/rates/rate_alternatives.py        # strip or attach, as the flag says
    python scripts/rates/rate_alternatives.py --check  # exit 1 if a file disagrees with the flag
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EVALUATED = HERE / "evaluated"
OUT = ROOT / "public" / "rates"
FEATURES = ROOT / "lib" / "rates" / "features.ts"


def luna_public() -> bool:
    """LUNA_RATES_PUBLIC, as lib/rates/features.ts sets it."""
    m = re.search(r"export const LUNA_RATES_PUBLIC\s*=\s*(true|false)", FEATURES.read_text(encoding="utf-8"))
    if not m:
        raise SystemExit(f"{FEATURES.relative_to(ROOT)}: LUNA_RATES_PUBLIC not found")
    return m.group(1) == "true"


def evaluated_rate(reaction_id: str) -> dict | None:
    """A rate computed from one of the site's AZURE2 evaluations
    (scripts/rates/evaluated_rates.py), as an alternative to REACLIB's."""
    path = EVALUATED / f"{reaction_id}.json"
    if not path.exists():
        return None
    d = json.loads(path.read_text(encoding="utf-8"))
    return {
        "id": "luna",
        "evaluation": d["evaluation"],
        "rate": {"kind": "table", "T9": d["T9"], "log10": d["log10"], "validity_T9": [d["T9"][0], d["T9"][-1]]},
        "paper": d["paper"],
        "fit": d["fit"],
        "method": d["method"],
    }


def apply(data: dict, public: bool | None = None) -> dict:
    """A network's dict with its reactions' `alternatives` attached (the flag
    on) or removed (off). An attached list goes where pyna_export puts it:
    after the rate's own keys, before `measured`."""
    public = luna_public() if public is None else public
    reactions = []
    for rj in data["reactions"]:
        rj = {k: v for k, v in rj.items() if k != "alternatives"}
        alt = evaluated_rate(rj["id"]) if public else None
        if alt:
            keys = list(rj)
            at = keys.index("measured") if "measured" in keys else len(keys)
            rj = {**{k: rj[k] for k in keys[:at]}, "alternatives": [alt], **{k: rj[k] for k in keys[at:]}}
        reactions.append(rj)
    return {**data, "reactions": reactions}


def dumps(data: dict) -> str:
    """The network files' serialization (build.py: write)."""
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def network_files() -> list[Path]:
    return sorted(p for p in OUT.glob("*.json") if p.stem.count(".") == 0)


def main() -> None:
    check = "--check" in sys.argv[1:]
    public = luna_public()
    bad = 0
    for p in network_files():
        old = p.read_text(encoding="utf-8")
        new = dumps(apply(json.loads(old), public))
        if new == old:
            continue
        if check:
            print(f"{p.relative_to(ROOT)}: alternatives disagree with LUNA_RATES_PUBLIC = {str(public).lower()}")
            bad += 1
        else:
            p.write_text(new, encoding="utf-8")
            print(f"{p.relative_to(ROOT)}: alternatives {'attached' if public else 'stripped'} "
                  f"({len(old) / 1024:.0f} → {len(new) / 1024:.0f} kB)")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()

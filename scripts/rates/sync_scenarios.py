#!/usr/bin/env python3
"""
Copy the words and labels of scripts/rates/scenarios.yaml (name, short,
source, note, each with its _it, and `power`) into the scenarios of the
committed network files, public/rates/<id>.json, without pynucastro.

build.py writes the same fields (pyna_export.py: scenario_json) when it
rebuilds the files from REACLIB; this is for a change to those fields alone,
where a rebuild would change nothing else. Every other byte stays as it was.

    python scripts/rates/sync_scenarios.py          # update the files
    python scripts/rates/sync_scenarios.py --check  # exit 1 if a file is out of date
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import rate_alternatives as ra  # noqa: E402

FIELDS = ["name", "name_it", "short", "short_it", "source", "source_it", "note", "note_it", "power"]


def synced(sc: dict, spec: dict) -> dict:
    """A scenario's dict with the fields of its scenarios.yaml entry, in scenario_json's order."""
    want = {
        "name": spec["name"], "name_it": spec["name_it"],
        "short": spec.get("short", spec["name"]), "short_it": spec.get("short_it", spec["name_it"]),
        "source": spec["source"], "source_it": spec["source_it"],
        "note": spec.get("note"), "note_it": spec.get("note_it"),
        "power": spec["power"],
    }
    out = {}
    for k, v in sc.items():
        if k == "power":
            continue
        out[k] = want.get(k, v)
        if k == "note_it":
            out["power"] = want["power"]
    return out


def main() -> None:
    check = "--check" in sys.argv[1:]
    specs = {s["id"]: s for s in yaml.safe_load((HERE / "scenarios.yaml").read_text(encoding="utf-8"))["scenarios"]}
    bad = 0
    for p in ra.network_files():
        old = p.read_text(encoding="utf-8")
        data = json.loads(old)
        data["scenarios"] = [synced(sc, specs[sc["id"]]) for sc in data["scenarios"]]
        new = ra.dumps(data)
        if new == old:
            continue
        bad += 1
        if check:
            print(f"{p.relative_to(ra.ROOT)}: scenarios differ from scenarios.yaml")
        else:
            p.write_text(new, encoding="utf-8")
            print(f"{p.relative_to(ra.ROOT)}: scenarios updated")
    sys.exit(1 if check and bad else 0)


if __name__ == "__main__":
    main()

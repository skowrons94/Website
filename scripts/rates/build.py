#!/usr/bin/env python3
"""
Write public/rates/<id>.json for every network of scripts/rates/networks.yaml
(and the s-process network of sprocess.py), from REACLIB through pynucastro.

    pip install pynucastro numpy scipy pyyaml
    python scripts/rates/build.py [network ids...]

Run from anywhere; paths are relative to the repository. The JSON is
committed, so `npm run build` needs no Python. After a change here, rerun
`node scripts/rates/baseline.mjs` (the precomputed first view) and
`python scripts/rates/reference.py` (pynucastro's own integration, which
`npm run test:rates` compares the browser solver against). The work itself
is in pyna_export.py.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import pyna_export as px  # noqa: E402

ROOT = HERE.parents[1]
OUT = ROOT / "public" / "rates"
ATLAS = ROOT / "content" / "atlas"


def atlas_reaction_ids() -> set[str]:
    ids = {p.stem for p in (ATLAS / "reactions").glob("*.yaml")}
    nets = yaml.safe_load((ATLAS / "networks.yaml").read_text(encoding="utf-8"))
    for n in nets["networks"]:
        ids.update(n["reactions"])
    return ids


def family_titles() -> dict[str, dict]:
    nets = yaml.safe_load((ATLAS / "networks.yaml").read_text(encoding="utf-8"))
    return {f["id"]: {"en": f["name"], "it": f.get("name_it", f["name"])} for f in nets["families"]}


def load_specs() -> tuple[list[dict], dict[str, dict]]:
    nets = yaml.safe_load((HERE / "networks.yaml").read_text(encoding="utf-8"))["networks"]
    scen = yaml.safe_load((HERE / "scenarios.yaml").read_text(encoding="utf-8"))["scenarios"]
    return nets, {s["id"]: s for s in scen}


def write(data: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{data['id']}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{path.relative_to(ROOT)}: {len(data['nuclei'])} nuclei, {len(data['reactions'])} reactions, "
          f"{path.stat().st_size / 1024:.0f} kB")


def main() -> None:
    only = set(sys.argv[1:])
    specs, scenarios = load_specs()
    atlas_ids = atlas_reaction_ids()
    titles = family_titles()
    for spec in specs:
        if only and spec["id"] not in only:
            continue
        write(px.export_network(spec, scenarios, atlas_ids=atlas_ids, title=titles.get(spec["family"])))
    if (HERE / "sprocess.py").exists() and (not only or "sprocess" in only):
        import sprocess
        write(sprocess.export(atlas_ids, titles))


if __name__ == "__main__":
    main()

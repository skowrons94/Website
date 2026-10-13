#!/usr/bin/env python3
"""
Write public/rates/<id>.json for every network of scripts/rates/networks.yaml
(the s-process network too: builder: sprocess), from REACLIB through pynucastro.

    pip install pynucastro numpy scipy pyyaml
    python scripts/rates/build.py [network ids...]

Run from anywhere; paths are relative to the repository. The JSON is
committed, so `npm run build` needs no Python. After a change here, rerun
`node scripts/rates/baseline.mjs` (the precomputed first view) and
`python scripts/rates/reference.py` (pynucastro's own integration, which
`npm run test:rates` compares the browser solver against). The work itself
is in pyna_export.py. The reactions' `alternatives` (the LUNA/AZURE2 tables)
are written only while LUNA_RATES_PUBLIC is true (rate_alternatives.py, which
also applies the flag to the committed files without pynucastro).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import pyna_export as px  # noqa: E402
import rate_alternatives  # noqa: E402

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


def atlas_meta() -> dict:
    """What the atlas knows about each reaction that the explorer shows:
    underground measurements (LUNA and others) and evaluations, with their
    references, for the LUNA marks and the "newer data" notes."""
    refs: dict[str, dict] = {}
    for f in sorted((ATLAS / "references").glob("*.yaml")):
        refs.update(yaml.safe_load(f.read_text(encoding="utf-8")) or {})
    fac = {f["id"]: f for f in yaml.safe_load((ATLAS / "facilities.yaml").read_text(encoding="utf-8"))["facilities"]}
    out = {}
    for p in sorted((ATLAS / "reactions").glob("*.yaml")):
        d = yaml.safe_load(p.read_text(encoding="utf-8"))
        meas = []
        for m in d.get("measurements") or []:
            f = fac.get(m.get("facility") or "")
            if not f or not f.get("underground"):
                continue
            meas.append({"year": int(m["year"]), "facility": f["id"], "facility_name": f["name"],
                         "luna": bool(f.get("luna")), "refs": [refs[r] | {"id": r} for r in m.get("refs", []) if r in refs]})
        evals = [refs[r] | {"id": r} for r in d.get("evaluations") or [] if r in refs]
        out[d["id"]] = {"measured": meas, "evaluations": evals}
    return out


def load_specs() -> tuple[list[dict], dict[str, dict]]:
    nets = yaml.safe_load((HERE / "networks.yaml").read_text(encoding="utf-8"))["networks"]
    scen = yaml.safe_load((HERE / "scenarios.yaml").read_text(encoding="utf-8"))["scenarios"]
    return nets, {s["id"]: s for s in scen}


def write(data: dict) -> None:
    # the evaluated rates ship only once the LUNA switch is public (lib/rates/features.ts)
    data = rate_alternatives.apply(data)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{data['id']}.json"
    path.write_text(rate_alternatives.dumps(data), encoding="utf-8")
    print(f"{path.relative_to(ROOT)}: {len(data['nuclei'])} nuclei, {len(data['reactions'])} reactions, "
          f"{path.stat().st_size / 1024:.0f} kB")


def main() -> None:
    only = set(sys.argv[1:])
    specs, scenarios = load_specs()
    atlas_ids = atlas_reaction_ids()
    titles = family_titles()
    meta = atlas_meta()
    for spec in specs:
        if only and spec["id"] not in only:
            continue
        write(px.export_network(spec, scenarios, atlas_ids=atlas_ids, title=titles.get(spec["family"]),
                                atlas_meta=meta))


if __name__ == "__main__":
    main()

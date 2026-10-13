"""ENSDF -> per-nuclide summaries for the explorer.

    python scripts/data/dx.py build-ensdf [--ensdf DIR] [--set atlas|scope]

The nuclides: the targets and compound nuclei (target + projectile) of the
reactions in the EXFOR index (`scope`), or of the atlas reactions only
(`atlas`, what is committed).  For each, the ADOPTED LEVELS(, GAMMAS) data set
of the ENSDF archive gives the levels (E +- dE, J-pi with firm/tentative, T1/2
or width, isospin), the gammas (E, I, photon branching, multipolarity,
mixing ratio, reduced strengths as given) and the evaluation (authors,
citation, literature cutoff).  Separation energies come from AME2020 (the
site's own table) and, with uncertainties, from the ENSDF Q record.

XUNDL is not used: the ENSDF archive does not contain it, and every file
says so (`xundl`).

Outputs: public/data/ensdf/<nuclide>.json and public/data/ensdf/index.json;
the "ensdf" block of public/data/meta.json.
"""

import glob
import json
import os
import re
import sys
from typing import Dict, List, Optional, Set, Tuple

from . import config, ensdf, masses
from .build_exfor import dumps
from .scope import atlas_reactions

_LABEL = re.compile(r"^(\d+)([A-Z][a-z]?)$")
PROJ = {"p": (1, 1), "d": (2, 1), "t": (3, 1), "3He": (3, 2), "a": (4, 2), "n": (1, 0), "g": (0, 0)}


def parse_label(label: str) -> Optional[Tuple[int, int]]:
    """'14N' -> (A, Z)."""
    if label == "n":
        return 1, 0
    m = _LABEL.match(label)
    if not m:
        return None
    sym = m.group(2)
    if sym not in masses.SYMBOLS:
        return None
    return int(m.group(1)), masses.SYMBOLS.index(sym)


def _key_parts(key: str):
    m = re.match(r"^([^()]+)\(([^,]+),([^)]*)\)$", key)
    return m.groups() if m else (None, None, None)


def nuclides_for(keys: List[str]) -> Set[Tuple[int, int]]:
    out = set()
    for key in keys:
        t, p, _ = _key_parts(key)
        tz = parse_label(t or "")
        if not tz or tz[0] == 0:
            continue
        out.add(tz)
        pz = PROJ.get(p) or parse_label(p or "")
        if pz and pz[0] > 0:
            out.add((tz[0] + pz[0], tz[1] + pz[1]))
    return out


def ensdf_files(root: str, wanted_A: Set[int]) -> List[str]:
    files = []
    for path in glob.glob(os.path.join(root, "**", "*"), recursive=True):
        base = os.path.basename(path)
        m = re.match(r"^ensdf\.(\d{3})$", base)              # NNDC archive: one file per A
        if m and int(m.group(1)) in wanted_A:
            files.append(path)
            continue
        m = re.match(r"^\d+-[A-Za-z]+-(\d+)\.orig\.ens$", base)  # mirror: one file per nuclide
        if m and int(m.group(1)) in wanted_A:
            files.append(path)
    return sorted(files)


def summaries(root: str, wanted: Set[Tuple[int, int]]) -> Dict[Tuple[int, int], dict]:
    want_ids = {ensdf.nucid(A, masses.symbol(Z)).strip(): (A, Z) for A, Z in wanted}
    out = {}
    for path in ensdf_files(root, {A for A, _ in wanted}):
        with open(path, encoding="latin-1") as f:
            for ds in ensdf.parse(f.read()):
                az = want_ids.get(ds.nucid.strip().upper()) or want_ids.get(ds.nucid.strip())
                if az is None:
                    continue
                if ds.dsid.startswith("ADOPTED LEVELS") and az not in out:
                    out[az] = ensdf.summary(ds)
    return out


def separations(A: int, Z: int) -> dict:
    r = lambda v: None if v is None else round(v, 5)
    return {"S_n": r(masses.separation(A, Z, 1, 0)), "S_p": r(masses.separation(A, Z, 1, 1)),
            "S_a": r(masses.separation(A, Z, 4, 2)), "unit": "MeV", "source": "AME2020"}


def run(argv=None):
    import argparse
    ap = argparse.ArgumentParser(prog="dx.py build-ensdf")
    ap.add_argument("--ensdf", help="directory from fetch-ensdf (default build/dx/ensdf/<kind>)")
    ap.add_argument("--set", choices=["atlas", "scope"], default="scope")
    ap.add_argument("--out", default=config.OUT_DIR)
    args = ap.parse_args(argv)

    src_file = os.path.join(config.CACHE_DIR, "ensdf", "SOURCE.json")
    used = {}
    if os.path.exists(src_file):
        with open(src_file) as f:
            used = json.load(f)
    root = args.ensdf or used.get("path")
    if not root or not os.path.isdir(root):
        raise SystemExit("no ENSDF files: run dx.py fetch-ensdf (or pass --ensdf DIR)")
    if not used:
        used = {"kind": "directory", "path": root}

    atlas = atlas_reactions()
    keys = list(atlas)
    if args.set == "scope":
        with open(os.path.join(args.out, "exfor", "index.json")) as f:
            keys = json.load(f)["reactions"]["key"]
    wanted = nuclides_for(keys)
    # The atlas' products too (the nuclei its reactions make).
    import yaml
    for path in glob.glob(os.path.join(config.ATLAS_DIR, "reactions", "*.yaml")):
        with open(path) as f:
            r = yaml.safe_load(f)
        for lab in (r.get("target"), r.get("product")):
            az = parse_label(str(lab or ""))
            if az and az[0] > 0:
                wanted.add(az)

    found = summaries(root, wanted)
    out_dir = os.path.join(args.out, "ensdf")
    os.makedirs(out_dir, exist_ok=True)
    for old in glob.glob(os.path.join(out_dir, "*.json")):
        os.remove(old)
    listing = []
    total = 0
    for (A, Z) in sorted(wanted, key=lambda x: (x[1], x[0])):
        label = f"{A}{masses.symbol(Z)}" if Z > 0 else "n"
        s = found.get((A, Z))
        doc = {"schema": "dx-ensdf", "schema_version": config.SCHEMA["ensdf"], "nuclide": label,
               "Z": Z, "A": A, "separation": separations(A, Z),
               "xundl": "not included (the ENSDF archive holds evaluated data sets only)"}
        if s:
            doc["ensdf"] = s
        text = dumps(doc)
        with open(os.path.join(out_dir, f"{label}.json"), "w") as f:
            f.write(text)
        total += len(text)
        listing.append({"nuclide": label, "Z": Z, "A": A, "levels": len(s["levels"]) if s else 0,
                        "evaluation": (s or {}).get("evaluation", {}).get("citation"),
                        "cutoff": (s or {}).get("evaluation", {}).get("cutoff"),
                        "bytes": len(text)})
    ensdf_meta = {
        "name": "ENSDF (Evaluated Nuclear Structure Data File), NNDC on behalf of the NSDD network",
        "archive_date": used.get("archive_date"),
        "source": {k: v for k, v in used.items() if k != "path"},
        "set": args.set,
        "nuclides": len(listing), "with_adopted_levels": len(found), "bytes": total,
        "citation": ("Evaluated Nuclear Structure Data File (ENSDF), National Nuclear Data Center, "
                     "Brookhaven National Laboratory, https://www.nndc.bnl.gov/ensdf/; cite also the "
                     "Nuclear Data Sheets evaluation of each nuclide (its `evaluation.citation`)."),
        "xundl": "excluded",
    }
    with open(os.path.join(out_dir, "index.json"), "w") as f:
        f.write(dumps({"schema": "dx-ensdf-index", "schema_version": config.SCHEMA["ensdf"],
                       "meta": ensdf_meta, "nuclides": listing}))
    meta_path = os.path.join(args.out, "meta.json")
    meta = {}
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            meta = json.load(f)
    meta["ensdf"] = ensdf_meta
    with open(meta_path, "w") as f:
        f.write(json.dumps(meta, ensure_ascii=False, indent=1))
    print(f"ENSDF: {len(listing)} nuclides, {len(found)} with adopted levels, {total / 1e6:.2f} MB",
          file=sys.stderr)
    missing = [l["nuclide"] for l in listing if not l["levels"]]
    if missing:
        print(f"  no adopted levels: {' '.join(missing[:60])}", file=sys.stderr)

"""The explorer's scope, as a test on a dataset's first reaction unit, and the
link from atlas reactions (content/atlas/reactions/*.yaml) to EXFOR reaction
keys.

Slices (a dataset can be in several):
  A  charged particles (p, d, t, 3He, alpha, ions Z <= 8) on targets Z <= 30
  B  (n,g) on Z = 26-83
  M  Maxwellian / spectrum averages (SF8 MXW, SPA) of neutron reactions, Z <= 83
  N  neutron-induced reactions on Z <= 30
"""

import glob
import os
import re
from typing import Dict, List

from . import config
from .dataset import nuclide
from .x4 import Primitive

SLICES = {"A": "charged-particle reactions on Z <= 30",
          "B": "neutron capture (n,g) on Z = 26-83 (s-process)",
          "M": "Maxwellian- and spectrum-averaged neutron data (MXW, SPA), Z <= 83",
          "N": "neutron-induced reactions on Z <= 30"}


def slices(p: Primitive) -> List[str]:
    t = nuclide(p.target)
    if not t:
        return []
    Z = t[0]
    if Z < 1:
        return []
    out = []
    proj = p.projectile
    ion = nuclide(proj)
    if Z <= config.TARGET_ZMAX_A and (proj in config.PROJECTILES_A or (ion and 1 <= ion[0] <= config.ION_ZMAX)):
        out.append("A")
    if proj == "N":
        mods = set(p.modifier.split("/")) if p.modifier else set()
        if p.process == "G" and config.CAPTURE_Z[0] <= Z <= config.CAPTURE_Z[1]:
            out.append("B")
        if mods & {"MXW", "SPA"} and Z <= config.MACS_ZMAX:
            out.append("M")
        if Z <= config.NEUTRON_ZMAX:
            out.append("N")
    return out


_ATLAS_PARTICLE = {"1H": "p", "2H": "d", "3H": "t", "3He": "3He", "4He": "a", "n": "n", "g": "g"}


def _label(tokens: str) -> str:
    parts = tokens.split()
    out, count = [], 1
    for t in parts:
        if t.isdigit():
            count = int(t)
            continue
        lab = _ATLAS_PARTICLE.get(t, t)
        out.append((str(count) if count > 1 else "") + lab)
        count = 1
    return "+".join(out)


def atlas_reactions(atlas_dir: str = None) -> Dict[str, List[str]]:
    """{EXFOR-style reaction key: [atlas ids]} for every atlas reaction with a
    projectile (decays have none)."""
    import yaml  # PyYAML; only needed here
    atlas_dir = atlas_dir or config.ATLAS_DIR
    out: Dict[str, List[str]] = {}
    for f in sorted(glob.glob(os.path.join(atlas_dir, "reactions", "*.yaml"))):
        with open(f) as fh:
            r = yaml.safe_load(fh)
        proj = str(r.get("projectile") or "").strip()
        if not proj or proj in ("e-",):
            continue
        ej = str(r.get("ejectile") or "").strip()
        if not ej or re.search(r"\b(e\+|nu|e-)\b", ej):
            continue
        key = f"{r['target']}({_label(proj)},{_label(ej)})"
        out.setdefault(key, []).append(r["id"])
    return out

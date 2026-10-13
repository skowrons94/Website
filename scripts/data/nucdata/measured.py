"""The per-point half of the rule for "lowest measured energy".

The rule is one, and lives in two places because the pages never load the
points: this module decides, point by point, which energies of a dataset
are a measurement, and writes the lowest of them to the index (columns
`m1`, `m2`: one per significance the owner may choose); lib/data/lowest.mjs
decides, dataset by dataset, which datasets count (quantity, flags,
indirect, a single S value) and picks the lowest. Both read the same
settings (lib/data/lowest.mjs, the JSON block
between its rule markers). scripts/data/README.md states the
whole rule.

A point is measured when
  * it is a value, not a limit (DATA-MAX/MIN rows are judged one by one: the
    other rows of the dataset still count);
  * its value is at least k standard deviations above zero (k = 1 or 2; the
    uncertainty is the point's total, else statistical and systematic in
    quadrature; a point without any uncertainty counts when its value is
    above zero, as nothing says otherwise). Legendre coefficients may be
    negative: their absolute value is judged;
  * its centre-of-mass energy is physical: at least 1 keV for a charged
    projectile on a charged target (no beam has gone lower), and not below
    the threshold -Q of an endothermic reaction.
"""

import json
import math
import os
import re
from typing import List, Optional, Tuple

from . import config, masses

RULE_FILE = os.path.join(config.REPO, "lib", "data", "lowest.mjs")


def read_rule(path: str = RULE_FILE) -> dict:
    """The settings of lib/data/lowest.mjs: the JSON between its rule:begin and rule:end markers."""
    with open(path) as f:
        text = f.read()
    m = re.search(r"/\* rule:begin \*/(.*?)/\* rule:end \*/", text, re.S)
    if not m:
        raise ValueError(f"{path}: no rule:begin ... rule:end block")
    return json.loads(m.group(1))


RULE = read_rule()

SIGMAS = tuple(RULE["sigma_choices"])          # (1, 2): index columns m1, m2
FLOOR_MEV = RULE["charged_floor_keV"] / 1000

# Ejectiles of a two-body process code: (A, Z); "G" leaves the compound nucleus.
EJECTILE = {"G": (0, 0), "N": (1, 0), "P": (1, 1), "D": (2, 1), "T": (3, 1), "HE3": (3, 2), "A": (4, 2)}


def threshold_mev(target: Optional[Tuple[int, int, str]], projectile: Optional[Tuple[int, int]],
                  process: str) -> float:
    """-Q (MeV, c.m.) of an endothermic two-body reaction, else 0.

    target (Z, A, isomer), projectile (A, Z), process an SF3 code; a natural
    target, an isomer or a process other than one light particle or a γ has
    no threshold here."""
    if not target or not projectile or target[1] == 0 or target[2]:
        return 0.0
    ej = EJECTILE.get(process)
    if ej is None:
        return 0.0
    Zt, At, _ = target
    Ap, Zp = projectile
    Ar, Zr = At + Ap - ej[0], Zt + Zp - ej[1]
    if Ar <= 0 or Zr < 0:
        return 0.0
    parts = [masses.mass_excess(At, Zt), masses.mass_excess(Ap, Zp) if Ap else 0.0,
             masses.mass_excess(ej[0], ej[1]) if ej[0] else 0.0, masses.mass_excess(Ar, Zr)]
    if any(x is None for x in parts):
        return 0.0
    q = parts[0] + parts[1] - parts[2] - parts[3]
    return -q if q < 0 else 0.0


def sigma_of(i: int, points: dict) -> Optional[float]:
    tot = points.get("d_tot")
    if tot and tot[i] is not None and tot[i] > 0:
        return tot[i]
    parts = [points[k][i] for k in ("d_stat", "d_sys") if points.get(k) and points[k][i] is not None]
    for v in (points.get("err") or {}).values():
        if v[i] is not None:
            parts.append(v[i])
    s = math.sqrt(sum(x * x for x in parts)) if parts else 0.0
    return s if s > 0 else None


def lowest(points: dict, charged: bool, threshold: float, k: float, signed: bool = True) -> Optional[float]:
    """The lowest E_cm (MeV) of a measured point at k standard deviations, or None."""
    E = points.get("E_cm") or []
    val = points.get("value") or []
    lim = points.get("limit")
    best = None
    for i, e in enumerate(E):
        if e is None or not math.isfinite(e) or e <= 0:
            continue
        if lim and lim[i] is not None:
            continue
        v = val[i] if i < len(val) else None
        if v is None or not math.isfinite(v):
            continue
        if not signed:
            v = abs(v)
        if v <= 0:
            continue
        s = sigma_of(i, points)
        if s is not None and v < k * s:
            continue
        if charged and e < FLOOR_MEV:
            continue
        if threshold > 0 and e < threshold * (1 - 1e-6):
            continue
        if best is None or e < best:
            best = e
    return best


def lowest_by_sigma(points: dict, charged: bool, threshold: float, signed: bool = True) -> List[Optional[float]]:
    """[lowest at k] for k in SIGMAS (index columns m1, m2)."""
    return [lowest(points, charged, threshold, k, signed) for k in SIGMAS]

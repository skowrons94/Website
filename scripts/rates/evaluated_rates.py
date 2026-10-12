#!/usr/bin/env python3
"""
Reaction rates from Jakub Skowronski's AZURE2 evaluations, for the rates
explorer's "Use the LUNA rate" option: ¹²C(p,γ)¹³N (server/evaluations/13N)
and ¹³C(p,γ)¹⁴N (server/evaluations/14N).

    PYTHONPATH=<pyazr> python scripts/rates/evaluated_rates.py

needs pyazr (the AZURE2 Python bindings the API runs; see server/README or
DEPLOY.md) and writes scripts/rates/evaluated/<reaction id>.json, which
build.py adds to the network files as an alternative rate of that reaction.
The JSON is committed: building the site needs neither pyazr nor this script.

What it does, per evaluation:

1. The cross section at the evaluation's shipped parameters (the .azr file as
   it is, unchanged), calculated by AZURE2 in extrapolation mode on a grid of
   its own: a derived copy of the .azr in a temporary directory with only its
   <segmentsTest> block replaced (the evaluation's own files, fits and
   external-capture integrals are not touched). The grid runs from 1 keV,
   below the Gamow window of T9 = 0.01 (E₀ ≈ 18 keV), to 4 MeV (lab), with
   steps of 1 keV or less up to 1.2 MeV, and is refined to a fraction of the
   width around every narrow level (Γ < 1 keV: the 448 keV resonance of
   ¹³C(p,γ), Γ ≈ 3 eV) so that the integral over it is resolved.
2. N_A⟨σv⟩(T9) = N_A (8/πμ)^½ (kT)^(-3/2) ∫ σ(E) E e^(−E/kT) dE, integrated
   numerically on that grid (trapezoids in E, σ interpolated log-linearly in
   S(E) between points), for T9 from 0.005 to 1.5. Above the grid's 4 MeV the
   integrand is negligible below T9 ≈ 1.5 (checked: the last 10% of the
   energy range carries < 1e-3 of the integral at T9 = 1).
3. The same quantity from REACLIB (the network's own fit) and the ratio, for
   the record.

The cross section is AZURE2's angle-integrated total capture, as the
evaluation's own extrapolation segments define it (the exit pair of ¹³N's
γ₀, and ¹⁴N's total-capture line).
"""

from __future__ import annotations

import json
import math
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EVALS = Path(os.environ.get("AZURE2_EVALUATIONS_DIR", ROOT / "server" / "evaluations"))
OUT = HERE / "evaluated"

# physical constants (CODATA 2018), CGS / MeV
NA = 6.02214076e23
K_MEV = 8.617333262e-11  # MeV/K
AMU_G = 1.66053906660e-24
MEV_ERG = 1.602176634e-6
BARN = 1e-24

T9_GRID = [float(x) for x in np.round(np.geomspace(0.005, 1.5, 66), 6)]

SPECS = [
    {
        "evaluation": "13N",
        "reaction": "C12_p_to_N13_reaclib",
        "label": "¹²C(p,γ)¹³N",
        "masses": (1.00727646688 + 0.000548579909, 12.0),  # atomic masses, u
        # the evaluation's own angle-integrated ¹²C(p,γ) line: entrance 1, exit 2
        "line": "1              1              2              {lo}          {hi}          {step}         0              0              0              0 0",
        "paper": {"authors": "J. Skowronski et al. (LUNA Collaboration)",
                  "title": "Proton-capture rates on carbon isotopes and their impact on the astrophysical ¹²C/¹³C ratio",
                  "journal": "Phys. Rev. Lett. 131, 162701 (2023)", "doi": "10.1103/PhysRevLett.131.162701"},
        "fit": {"journal": "Phys. Rev. C 111, 035802 (2025)", "doi": "10.1103/PhysRevC.111.035802"},
    },
    {
        "evaluation": "14N",
        "reaction": "C13_p_to_N14_reaclib",
        "label": "¹³C(p,γ)¹⁴N",
        "masses": (1.00727646688 + 0.000548579909, 13.00335483507),
        # the evaluation's total-capture line: exit pair -1, observable 4
        "line": "1              1              -1             {lo}          {hi}          {step}         0              0              0              4 0",
        "paper": {"authors": "J. Skowronski et al. (LUNA Collaboration)",
                  "title": "Proton-capture rates on carbon isotopes and their impact on the astrophysical ¹²C/¹³C ratio",
                  "journal": "Phys. Rev. Lett. 131, 162701 (2023)", "doi": "10.1103/PhysRevLett.131.162701"},
        "fit": {"journal": "Phys. Rev. C 111, 064611 (2025)", "doi": "10.1103/h1yt-5myk"},
    },
]


def lab_grid(narrow_lab: list[tuple[float, float]]) -> list[tuple[float, float, float]]:
    """(lo, hi, step) in MeV (lab) pieces: AZURE2's grids are uniform."""
    pieces = [(0.001, 0.1, 0.0005), (0.1, 1.2, 0.001), (1.2, 2.5, 0.004), (2.5, 4.0, 0.01)]
    for e, w in narrow_lab:
        # the level's width (lab) w: ±20 w at w/20, then ±400 w at w, then ±5 keV at 20 w
        for half, step in ((20 * w, w / 20), (400 * w, w), (max(5e-3, 8000 * w), max(20 * w, 2.5e-5))):
            pieces.append((e - half, e + half, step))
    return pieces


def narrow_levels(azr_text: str, sep: float, ratio_lab: float, limit_ev: float = 1000.0):
    """Levels above the entrance threshold whose entrance width (eV) is below `limit_ev`, as
    (E_lab, Γ_lab) in MeV; the total width is taken as twice the larger of Γp and 1 eV."""
    block = re.search(r"<levels>\n(.*?)</levels>", azr_text, flags=re.S).group(1)
    out = []
    for line in block.splitlines():
        f = line.split()
        if len(f) < 22:
            continue
        if f[5] != "1":  # entrance channel rows only
            continue
        ex, width = float(f[2]), abs(float(f[11]))
        er = ex - sep
        if 0 < er < 3.5 and 0 < width < limit_ev:
            out.append((er * ratio_lab, 2 * max(width, 1.0) * 1e-6 * ratio_lab))
    return sorted(set(out))


def calculate(spec: dict) -> dict:
    import pyazr

    src = EVALS / spec["evaluation"]
    azr = src / f"{spec['evaluation']}.azr"
    text = azr.read_text()
    mp, mt = spec["masses"]
    ratio_lab = (mp + mt) / mt
    first = re.search(r"<levels>\n(.*)", text).group(1).split()
    sep = float(first[21])  # the entrance pair's separation energy, MeV
    narrow = narrow_levels(text, sep, ratio_lab)
    pieces = lab_grid(narrow)
    lines = [spec["line"].format(lo=f"{lo:.9g}", hi=f"{hi:.9g}", step=f"{st:.9g}") for lo, hi, st in pieces if lo > 0]
    derived = re.sub(r"<segmentsTest>\n.*?</segmentsTest>", "<segmentsTest>\n" + "\n".join(lines) + "\n</segmentsTest>",
                     text, flags=re.S)
    with tempfile.TemporaryDirectory(prefix=f"rate-{spec['evaluation']}-") as tmp:
        work = Path(tmp)
        for item in src.iterdir():
            if item.name in ("output", "checks", "fine", "precomputed.json", "initial.json"):
                continue
            (work / item.name).symlink_to(item)
        (work / "output").mkdir()
        (work / "checks").mkdir()
        path = work / f"{spec['evaluation']}-rate.azr"
        path.write_text(derived)
        # built until AZURE2 reads its external-capture integrals back rather than
        # writing them, as the API does (server/app/engine.py, _settled): a total
        # capture over several capture pairs (¹⁴N) comes out right only then
        stored = work / "output" / "intEC.extrap"

        def stamp():
            return (stored.stat().st_mtime_ns, stored.stat().st_size) if stored.exists() else None

        for attempt in range(3):
            before = stamp()
            model = pyazr.azure2(str(path), cwd=str(work), data_mode=False)
            if stamp() == before or attempt == 2:
                break
            model.close()
        try:
            params = np.asarray(model.params if hasattr(model, "params") else model.parameters, dtype=float)
            s = model.sess
            n = int(s.update_segments(params))
            E, sig = [], []
            for i in range(n):
                E.append(np.asarray(s.calculated_energies(i), dtype=float))
                sig.append(np.asarray(s.calculated_segments(i), dtype=float))
        finally:
            model.close()
    E = np.concatenate(E)
    sig = np.concatenate(sig)
    order = np.argsort(E)
    E, sig = E[order], sig[order]
    keep = np.concatenate([[True], np.diff(E) > 1e-12])
    return {"E": E[keep], "sigma_b": sig[keep], "narrow_cm": [e / ratio_lab for e, _ in narrow],
            "params": params.tolist(), "mu": mp * mt / (mp + mt)}


def sommerfeld_2pi_eta(E: np.ndarray, z1z2: int, mu: float) -> np.ndarray:
    """2πη for E (MeV, c.m.) and reduced mass mu (u): 31.29 Z₁Z₂ (μ/E[keV])^½."""
    return 31.29 * z1z2 * np.sqrt(mu / (E * 1e3))


def rate(E: np.ndarray, sigma_b: np.ndarray, mu: float, T9: float, z1z2: int = 6) -> float:
    """N_A⟨σv⟩ in cm³ mol⁻¹ s⁻¹: the Maxwell–Boltzmann integral on the grid, the
    integrand interpolated through the S-factor (smooth) on a 10× finer mesh."""
    kT = K_MEV * T9 * 1e9
    S = sigma_b * E * np.exp(sommerfeld_2pi_eta(E, z1z2, mu))
    # refine each interval tenfold, S linear in E (σ itself varies by orders of magnitude)
    t = np.linspace(0, 1, 11)[:-1]
    Ef = (E[:-1, None] + np.diff(E)[:, None] * t[None, :]).ravel()
    Sf = (S[:-1, None] + np.diff(S)[:, None] * t[None, :]).ravel()
    Ef = np.append(Ef, E[-1])
    Sf = np.append(Sf, S[-1])
    sig = Sf / Ef * np.exp(-sommerfeld_2pi_eta(Ef, z1z2, mu))
    integrand = sig * BARN * Ef * np.exp(-Ef / kT)  # cm² MeV
    integral = np.trapezoid(integrand, Ef)  # cm² MeV²
    m = mu * AMU_G
    # <σv> = sqrt(8/(π m)) (kT)^(-3/2) ∫ σ E e^(-E/kT) dE, with E in erg
    sv = math.sqrt(8 / (math.pi * m)) * (kT * MEV_ERG) ** -1.5 * integral * MEV_ERG**2
    return NA * sv


def reaclib(reaction: str, T9: float) -> float:
    net = json.loads((ROOT / "public" / "rates" / "cno.json").read_text())
    r = next(x for x in net["reactions"] if x["id"] == reaction)
    t13 = T9 ** (1 / 3)
    return sum(math.exp(a[0] + a[1] / T9 + a[2] / t13 + a[3] * t13 + a[4] * T9 + a[5] * T9 ** (5 / 3) + a[6] * math.log(T9))
               for a in (s["a"] for s in r["rate"]["sets"]))


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for spec in SPECS:
        if len(sys.argv) > 1 and spec["evaluation"] not in sys.argv[1:]:
            continue
        res = calculate(spec)
        E, sig, mu = res["E"], res["sigma_b"], res["mu"]
        lam = [rate(E, sig, mu, T9) for T9 in T9_GRID]
        ref = [reaclib(spec["reaction"], T9) for T9 in T9_GRID]
        # how much of the integral the top of the grid carries (should be tiny)
        cut = E < 0.9 * E.max()
        tail = max(1 - rate(E[cut], sig[cut], mu, T9) / rate(E, sig, mu, T9) for T9 in T9_GRID)
        doc = {
            "reaction": spec["reaction"],
            "label": spec["label"],
            "evaluation": spec["evaluation"],
            "paper": spec["paper"],
            "fit": spec["fit"],
            "method": ("AZURE2 (pyazr) at the evaluation's shipped parameters, extrapolation mode on a grid of "
                       f"{len(E)} energies from {E.min() * 1e3:.2f} keV to {E.max():.2f} MeV (c.m.), refined around the "
                       "narrow levels; N_A<σv> by numerical Maxwell–Boltzmann integration "
                       "(scripts/rates/evaluated_rates.py)"),
            "narrow_levels_keV": [round(e * 1e3, 2) for e in res["narrow_cm"]],
            "grid_points": int(len(E)),
            "tail_fraction": tail,
            "T9": T9_GRID,
            "log10": [round(math.log10(v), 5) for v in lam],
            "reaclib_ratio": [round(v / r, 5) for v, r in zip(lam, ref)],
        }
        path = OUT / f"{spec['reaction']}.json"
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=1))
        print(f"{path.relative_to(ROOT)}: {len(E)} energies, tail {tail:.1e}")
        for T9, v, r in zip(T9_GRID, lam, ref):
            if any(abs(math.log10(T9 / x)) < 0.0185 for x in (0.007, 0.01, 0.0157, 0.02, 0.035, 0.05, 0.08, 0.1, 0.2, 0.3, 0.5, 1.0)):
                print(f"  T9 {T9:7.4f}: N_A<σv> {v:.4e}, REACLIB {r:.4e}, ratio {v / r:.3f}")


if __name__ == "__main__":
    main()

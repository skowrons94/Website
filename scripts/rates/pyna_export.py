"""
pynucastro → the rates explorer's network JSON (schema below), as functions.

Importable on its own (a future server endpoint can call `export_network` with
a spec of its own) and used by the command-line scripts beside it:

    build.py       writes public/rates/<id>.json for scripts/rates/networks.yaml
    reference.py   integrates the same networks with pynucastro + scipy BDF

Nothing here touches the site: give it a spec, get a dict.

Schema (schema_version 1) — CGS throughout; `units` in the file spells
every unit out:

    schema, schema_version, id, family, title{en,it}, provenance{...}, units{...}
    nuclei[]      {name, Z, A, label, code, halfLife_s, dm_MeV}   (NUBASE2020, null when stable;
                   dm_MeV the AME2020 atomic mass excess)
    reactions[]   {id, label, atlas, target, reactants[idx], products[idx], prefactor,
                   densExp, ye, screen[[Z1,A1,Z2,A2]], Q_MeV, chapter, weak,
                   weakType, rate{kind, ...}, sources[], nu?{MeV, src}}
                  nu: a weak reaction's mean neutrino energy (energy section below)
                  rate.kind "reaclib": {sets[{a[7], set, flag}], validity_T9}
                  (a later kind "table" would carry {T9[], log10[]} instead)
    ui            {key[], reference, fuel, cycle[], show[], groups, knobs, track, notes,
                   newer{reaction: {en, it}}, not_modelled{nucleus: {en, it}}}  (what to show first)
    scenarios[]   {id, name, name_it, T9, rho, time_s, until, X{name: X}, profile?, ...}
                  profile (optional): T(t)/T9 and ρ(t)/rho at times t_s, a burn whose
                  conditions change (T9 and rho are then the peak values); the solver
                  interpolates T linearly and ρ log-linearly between the points
    solar         Lodders mass fractions of the network's nuclei
    solver        optional {rtol, atol} for the explorer's burns
    screening     constants of pynucastro's screen5 plasma factors
    energy        {masses, MeV2erg, nu_sources{key: {en, it}}}

The ydot term of a reaction is, exactly as in pynucastro's generated
networks,

    prefactor · ρ^densExp · (Ye if ye) · Π Y_reactant · λ(T9) · e^{h_screen}

where λ is N_A^{n−1}⟨σv⟩ for n reactants (s⁻¹ for a decay).

Decays (lab_decays): REACLIB decays of nuclei that NUBASE2020 gives as stable
or longer-lived than 10⁸ years are dropped, and the ground-state decay of ²⁶Al
is added as a constant set labelled nb20 (GROUND_STATE_DECAYS).
"""

from __future__ import annotations

import csv
import re
import json
import datetime as _dt
import math
from pathlib import Path

import copy

import pynucastro as pyna
from pynucastro.constants import constants
from pynucastro.nucdata.composition import LODDERS_DATA
from pynucastro.rates.reaclib_rate import SingleSet

SCHEMA = "skowronski.rates.network"
SCHEMA_VERSION = 1
LIBFILE = "reaclib_default2_20250330"
YR = 3.15576e7  # Julian year, s

# NUBASE2020 half-lives as the atlas keeps them (A, Z, seconds or "stable"),
# beside this repository's content. A caller elsewhere passes its own table.
NUBASE_FILE = Path(__file__).resolve().parents[2] / "content" / "atlas" / "nuclear-data" / "nubase2020-halflife.txt"
NUBASE_REF = {
    "author": "F. G. Kondev et al.",
    "title": "The NUBASE2020 evaluation of nuclear physics properties",
    "ref": "Chinese Phys. C 45, 030001",
    "year": "2021",
    "url": "https://doi.org/10.1088/1674-1137/abddae",
}

# A nucleus living longer than this is stable for every burn here (the
# longest is 10⁵ years): REACLIB decays of such nuclei are dropped. Some of
# them are not even right: REACLIB carries a β⁻ decay of ⁹⁶Zr (mo03, t½ ≈ 7
# years; NUBASE2020: 2.3 × 10¹⁹ years) and a β⁺ decay of the stable ¹²³Te
# (mo97, 100 s), which would burn two key s-process nuclei.
LONG_LIVED_S = 1.0e8 * YR

# Decays whose REACLIB entry lacks the laboratory ground-state decay.
# ²⁶Al: REACLIB (wc12) holds only the thermally populated isomer ²⁶Alᵐ
# (228 keV, 6.35 s) in equilibrium with the ground state, a term that
# vanishes below ~0.05 GK; the ground state's own β⁺ decay (t½ = 7.17 × 10⁵
# yr, NUBASE2020) is added as a constant set, so λ = λ_gs + λ_isomer(T).
# The isomer term assumes thermal equilibrium between the two, which holds
# above ~0.4 GK only (Gupta & Meyer 2001, PRC 64, 025805; Iliadis et al.
# 2011, ApJS 193, 16); below that it is an upper bound.
GROUND_STATE_DECAYS = {"Al26_to_Mg26_beta_pos_reaclib": (26, 13)}

SUP = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")
LIGHT = {(0, 1): "n", (1, 1): "p", (1, 2): "d", (2, 4): "α"}

UNITS = {
    "T9": "temperature in GK (10⁹ K)",
    "rho": "density in g cm⁻³",
    "time_s": "seconds",
    "halfLife_s": "seconds",
    "Q_MeV": "MeV",
    "X": "mass fraction",
    "Y": "molar abundance X/A, mol g⁻¹",
    "rate": "N_A^(n−1)⟨σv⟩ for n reactants: s⁻¹ (decay), cm³ mol⁻¹ s⁻¹ (two-body), cm⁶ mol⁻² s⁻¹ (three-body)",
}

# REACLIB rate → atlas reaction id where the automatic rule does not find it:
# the weak pp reactions, and ⁸B, whose REACLIB decay goes straight to two α
# particles through ⁸Be.
ATLAS_IDS = {
    "p_p_to_d_beta_pos_reaclib": "1H-pp-2H",
    "p_p_to_d_electron_capture_reaclib": "1H-pep-2H",
    "He3_p_to_He4_beta_pos_reaclib": "3He-hep-4He",
    "He3_He3_to_p_p_He4_reaclib": "3He-3He2p-4He",
    "B8_to_He4_He4_beta_pos_reaclib": "8B-bp-8Be",
    "Be7_to_Li7_electron_capture_reaclib": "7Be-ec-7Li",
    "Li7_p_to_He4_He4_reaclib": "7Li-pa-4He",
}


# -- the library -------------------------------------------------------------

_LIB: dict = {}


def library(libfile: str = LIBFILE):
    """The REACLIB snapshot (loaded once per process: it takes seconds)."""
    if libfile not in _LIB:
        _LIB[libfile] = pyna.ReacLibLibrary(libfile=libfile)
    return _LIB[libfile]


_SUP = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")


def nuclide_marks(title: str) -> str:
    """"17O(α,n)20Ne" → "¹⁷O(α,n)²⁰Ne": mass numbers as superscripts."""
    title = re.sub(r"\b(\d{1,3}) ?([A-Z][a-z]?)(?= ?\(|\b)", lambda m: m[1].translate(_SUP) + m[2], title)
    return re.sub(r"(\S)\( ?([pnαγ]) ?, ?([pnαγ]) ?\)", r"\1(\2,\3)", title)


# pynucastro's rate_sources.csv lost the Greek letters of some titles ("?"),
# and misspells or truncates a few names and references; these are the
# papers' own (checked against the DOIs).
SOURCE_FIXES: dict[str, dict] = {
    "be13": {"title": "Measurement of the reaction ¹⁷O(α,n)²⁰Ne and its impact on the s process in massive stars",
             "ref": "Phys. Rev. C 87, 045805"},
    "da18": {"title": "The ¹⁹F(α,p)²²Ne reaction at energies of astrophysical relevance by means of the Trojan Horse "
                      "method and its implications in AGB stars", "ref": "ApJ 860, 61"},
    "ke17": {"author": "K. J. Kelly et al.",
             "title": "New measurements of low-energy resonances in the ²²Ne(p,γ)²³Na reaction",
             "ref": "Phys. Rev. C 95, 015806"},
    "li20": {"title": "Simultaneous measurement of β-delayed proton and γ emission of ²⁶P for the ²⁵Al(p,γ)²⁶Si "
                      "reaction rate", "ref": "Phys. Rev. C 101, 024305"},
    "ly18": {"title": "Determination of ²⁰Ne(p,γ)²¹Na cross sections from Eₚ = 500–2000 keV",
             "ref": "Phys. Rev. C 97, 065802"},
    "im05": {"title": "S-factor of ¹⁴N(p,γ)¹⁵O at astrophysical energies", "ref": "Eur. Phys. J. A 25, 455"},
    "co10": {"author": "Costantini, H. et al."},
    "ka02": {"author": "I. Dillmann et al.", "title": "KADoNiS: the Karlsruhe Astrophysical Database of "
             "Nucleosynthesis in Stars (v0.2)", "year": "2006"},
    "dc11": {"title": "The influence of uncertainties in the ¹⁵O(α,γ)¹⁹Ne reaction rate on models of type I X-ray bursts"},
    "gl12": {"title": "New determination of the ¹³C(α,n)¹⁶O reaction rate and its influence on the s-process "
                      "nucleosynthesis in AGB stars", "ref": "ApJ 756, 193"},
    "lg06": {"title": "¹³N(d,n)¹⁴O reaction and the astrophysical ¹³N(p,γ)¹⁴O reaction rate"},
    "cd08": {"title": "Evaluation of modern ³He(α,γ)⁷Be data"},
    "fy05": {"title": "Revised rates for the stellar triple-α process from measurement of ¹²C nuclear resonances"},
    "kg91": {"title": "¹⁷O(n,α)¹⁴C cross section from 25 meV to approximately 1 MeV"},
    "Ha96": {"ref": "Phys. Rev. C 54, 1999"},
    "ia08": {"ref": "Phys. Rev. C 77, 045802"},
    "li10": {"title": "Constraining the S factor of ¹⁵N(p,γ)¹⁶O at astrophysical energies"},
    "wies": {"author": "M. Wiescher"},
}


# REACLIB's bet+ label is titled "experimental beta-plus rates" (a generic
# title for the label), but its p+p and ³He+p sets are not measurements: the
# p+p fusion cross section has never been measured, and both rates are
# calculated from the theory of the weak interaction. Their coefficients are
# the fits of Caughlan & Fowler 1988: the ³He(p,e⁺ν)⁴He set is CF88's formula
# exactly (8.78·10⁻¹³ T₉^(−2/3) exp(−6.141 T₉^(−1/3))), the p+p set is within
# 1.5% of CF88's p+p formula from 10 MK to 1 GK (3.5% at 5 MK). The note says so beside the
# source, in both languages.
CF88 = {
    "author": "G. R. Caughlan, W. A. Fowler",
    "title": "Thermonuclear reaction rates V",
    "ref": "ADNDT 40, 283",
    "year": "1988",
    "url": "https://doi.org/10.1016/0092-640X(88)90009-5",
}
RATE_SOURCE_FIXES: dict[tuple[str, str], dict] = {
    ("p_p_to_d_beta_pos_reaclib", "bet+"): {
        **CF88,
        "note": "calculated from weak-interaction theory: p+p fusion has never been measured",
        "note_it": "calcolato dalla teoria dell'interazione debole: la fusione p+p non è mai stata misurata",
    },
    ("He3_p_to_He4_beta_pos_reaclib", "bet+"): {
        **CF88,
        "note": "calculated from weak-interaction theory, not measured",
        "note_it": "calcolato dalla teoria dell'interazione debole, non misurato",
    },
}


def rate_sources(fname: str, labels: list[str], sources: dict) -> list[dict]:
    """The sources of one rate's sets, with RATE_SOURCE_FIXES applied."""
    return [{"set": l, **sources.get(l, {}), **RATE_SOURCE_FIXES.get((fname, l), {})} for l in labels]


def load_sources() -> dict[str, dict]:
    """REACLIB set label → {author, title, ref, year, url}, from pynucastro."""
    path = Path(pyna.__file__).parent / "data" / "rate_sources.csv"
    out = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.reader(f, delimiter="|"):
            if not row or row[0] == "Label":
                continue
            label_, author, title, publisher, year, url = (row + [""] * 7)[:6]

            def clean(v: str) -> str:
                v = v.strip()
                return "" if v in ("-", "0") else v
            out[label_.strip()] = {
                "author": clean(author),
                "title": clean(title).replace("&gamma;", "γ").replace("&alpha;", "α").replace("<sup>", "").replace("</sup>", ""),
                "ref": clean(publisher),
                "year": clean(year),
                "url": clean(url) or None,
            }
    for k, v in out.items():
        v["title"] = nuclide_marks(v["title"])
    for k, fix in SOURCE_FIXES.items():
        if k in out:
            out[k].update(fix)
    out["nb20"] = dict(NUBASE_REF)
    # pynucastro's row for ls09 is misparsed (an HTML fragment in the author
    # field, the DOI in the year): the paper is Li et al. 2010, the ANC of
    # ¹³N from the ¹²C(⁷Li,⁶He)¹³N transfer reaction and the direct-capture
    # rate of ¹²C(p,γ)¹³N derived from it (arXiv:0905.1530)
    out["ls09"] = {
        "author": "Li, Z. H. et al.",
        "title": "ANC of ¹³N from ¹²C(⁷Li,⁶He)¹³N and the ¹²C(p,γ)¹³N rate",
        "ref": "Sci. China Phys. Mech. Astron. 53 (2010)",
        "year": "2010",
        "url": "https://doi.org/10.1007/s11433-010-0128-8",
    }
    return out


def nubase_halflives(path: Path | str | None = NUBASE_FILE) -> dict[tuple[int, int], float]:
    """(A, Z) → half-life in s (math.inf when stable), from the atlas' NUBASE2020 table."""
    out: dict[tuple[int, int], float] = {}
    if path is None or not Path(path).exists():
        return out
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        f = line.split()
        if len(f) < 3 or not f[0].isdigit():
            continue
        out[(int(f[0]), int(f[1]))] = math.inf if f[2] == "stable" else float(f[2])
    return out


def half_life(nuc, hl: dict) -> float:
    """NUBASE2020 half-life of a nucleus in s (inf when stable), else pynucastro's."""
    if (nuc.A, nuc.Z) in hl:
        return hl[(nuc.A, nuc.Z)]
    return math.inf if nuc.tau in ("stable", None) else float(nuc.tau)


def is_decay(r) -> bool:
    return len(r.reactants) == 1


def lab_decays(rates, hl: dict, limit_s: float = LONG_LIVED_S):
    """The rates with decays of (practically) stable nuclei dropped and the
    missing ground-state decays (GROUND_STATE_DECAYS) added as a constant set."""
    out = []
    for r in rates:
        if is_decay(r) and half_life(r.reactants[0], hl) > limit_s:
            continue
        if r.fname in GROUND_STATE_DECAYS:
            A, Z = GROUND_STATE_DECAYS[r.fname]
            t = hl.get((A, Z))
            if not t or not math.isfinite(t):
                raise ValueError(f"{r.fname}: no NUBASE2020 half-life for A={A}, Z={Z}")
            if not any(st.labelprops.startswith("nb20") for st in r.sets):
                r = copy.deepcopy(r)
                r.sets.append(SingleSet([math.log(math.log(2) / t), 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], "nb20w "))
        out.append(r)
    return out


# -- selection -------------------------------------------------------------------

def select_hydrogen_burning(r) -> bool:
    """Proton captures and weak decays, exothermic only."""
    if r.Q < 0:
        return False
    if len(r.reactants) == 1:
        return True
    return any(n.raw == "p" for n in r.reactants)


SELECTORS = {
    "all": lambda r: True,
    "hydrogen-burning": select_hydrogen_burning,
}


def network_rates(nuclei, select="all", include=(), exclude=(), libfile: str = LIBFILE, hl: dict | None = None):
    """(nuclei, rates): the forward REACLIB rates linking `nuclei`, filtered.

    `select` is a SELECTORS key or a function rate → bool; `include` and
    `exclude` are pynucastro rate names (fname) added or removed after it.
    """
    nucs = pyna.Nucleus.cast_list(nuclei)
    sub = library(libfile).linking_nuclei(nucs, with_reverse=False, print_warning=False)
    keep = SELECTORS[select] if isinstance(select, str) else select
    inc, exc = set(include), set(exclude)
    rates = [r for r in sub.get_rates() if (keep(r) or r.fname in inc) and r.fname not in exc]
    rates = lab_decays(rates, nubase_halflives() if hl is None else hl)
    missing = inc - {r.fname for r in rates}
    if missing:
        raise ValueError(f"include: no such rate among these nuclei: {sorted(missing)}")
    rates.sort(key=lambda r: (_heaviest(list(r.reactants)).A, _heaviest(list(r.reactants)).Z,
                              len(r.reactants) == 1, r.fname))
    return nucs, rates


# -- labels ------------------------------------------------------------------------

def code(nuc) -> str:
    """Atlas code: 14N, 1H, n."""
    return "n" if nuc.Z == 0 else f"{nuc.A}{nuc.el.capitalize()}"


def sci(nuc) -> str:
    """¹⁴N."""
    return "n" if nuc.Z == 0 else f"{str(nuc.A).translate(SUP)}{nuc.el.capitalize()}"


def _particle(nuc) -> str:
    return LIGHT.get((nuc.Z, nuc.A), sci(nuc))


def _heaviest(nucs):
    return sorted(nucs, key=lambda n: (n.A, n.Z))[-1]


def _group(nucs) -> str:
    """[p, p] → 2p; [α] → α."""
    out, seen = [], []
    for n in nucs:
        if n in seen:
            continue
        seen.append(n)
        k = nucs.count(n)
        out.append(f"{k if k > 1 else ''}{_particle(n)}")
    return "".join(out)


# Which reactant is the projectile: the first of these present, the other
# being the target (³He(α,γ)⁷Be, not ⁴He(³He,γ)⁷Be); otherwise the lighter.
PROJECTILES = [(1, 1), (0, 1), (1, 2), (2, 4), (2, 3)]


def _split(r):
    reactants, products = list(r.reactants), list(r.products)
    target = _heaviest(reactants)
    if len(reactants) == 2 and reactants[0] != reactants[1]:
        for za in PROJECTILES:
            proj = [n for n in reactants if (n.Z, n.A) == za]
            if proj:
                target = [n for n in reactants if n is not proj[0]][0]
                break
    residual = _heaviest(products)
    rest_in, rest_out = list(reactants), list(products)
    rest_in.remove(target)
    rest_out.remove(residual)
    return target, rest_in, residual, rest_out


def label(r) -> str:
    """¹⁴N(p,γ)¹⁵O, ¹³N(β⁺ν)¹³C, ³He(³He,2p)⁴He, ¹H(pe⁻,ν)²H."""
    target, rest_in, residual, rest_out = _split(r)
    if r.weak:
        kind = r.weak_type or ""
        if not rest_in:
            if kind == "electron_capture":
                return f"{sci(target)}(e⁻,ν){sci(residual)}"
            lep = {"beta_pos": "β⁺ν", "beta_neg": "β⁻ν̄"}.get(kind, "weak")
            if rest_out:  # ⁸B(β⁺ν)2α
                return f"{sci(target)}({lep}){_group(list(r.products))}"
            return f"{sci(target)}({lep}){sci(residual)}"
        if kind == "electron_capture":
            return f"{sci(target)}({_group(rest_in)}e⁻,ν){sci(residual)}"
        return f"{sci(target)}({_group(rest_in)},e⁺ν){sci(residual)}"
    if not rest_in:
        return f"{sci(target)}({_group(rest_out)}){sci(residual)}"
    ej = _group(rest_out) if rest_out else "γ"
    return f"{sci(target)}({_group(rest_in)},{ej}){sci(residual)}"


def atlas_id(r, atlas_ids) -> str | None:
    """The atlas page of a rate (content/atlas/reactions/<id>.yaml), if any."""
    if r.fname in ATLAS_IDS:
        return ATLAS_IDS[r.fname] if ATLAS_IDS[r.fname] in atlas_ids else None
    target, rest_in, residual, rest_out = _split(r)
    short = {(0, 1): "n", (1, 1): "p", (1, 2): "d", (2, 4): "a"}
    if r.weak and not rest_in:
        kind = {"beta_pos": "bp", "beta_neg": "bm", "electron_capture": "ec"}.get(r.weak_type or "", "")
        cand = f"{code(target)}-{kind}-{code(residual)}"
    elif len(rest_in) == 1 and (rest_in[0].Z, rest_in[0].A) in short:
        a = short[(rest_in[0].Z, rest_in[0].A)]
        b = "g" if not rest_out else "".join(short.get((n.Z, n.A), "?") for n in rest_out)
        cand = f"{code(target)}-{a}{b}-{code(residual)}"
    else:
        return None
    return cand if cand in atlas_ids else None


# -- compositions --------------------------------------------------------------------

def lodders() -> dict[str, float]:
    """Lodders (2021) present-day solar mass fractions, normalised (pynucastro)."""
    total = sum(LODDERS_DATA.values())
    return {k: v / total for k, v in LODDERS_DATA.items()}


def resolve_composition(spec: dict) -> dict[str, float]:
    """A composition spec (scenarios.yaml) → {pynucastro name: X}."""
    if "mix" in spec:
        out: dict[str, float] = {}
        for w, sub in spec["mix"]:
            for k, v in resolve_composition(sub).items():
                out[k] = out.get(k, 0.0) + w * v
        return out
    X: dict[str, float] = lodders() if spec.get("base") == "lodders" else {}
    # heavy: lodders — the Lodders mass fractions of the nuclei from Z = 26
    # (iron) up, the seeds of the s-process, beside a light composition set
    # by hand
    if spec.get("heavy") == "lodders":
        X.update({k: v for k, v in lodders().items() if pyna.Nucleus(k).Z >= 26})
    scale = spec.get("scale_metals")
    if scale is not None:
        X = {k: (v * scale if pyna.Nucleus(k).Z > 2 else v) for k, v in X.items()}
    for k, v in (spec.get("set") or {}).items():
        X[k] = float(v)
    bal = spec.get("balance")
    if bal:
        X[bal] = 0.0
        X[bal] = 1.0 - sum(X.values())
    return X


def comp_key(nuc) -> str:
    """The key of a nucleus in a composition: Lodders writes h1, h2 for p, d."""
    return {"p": "h1", "d": "h2"}.get(nuc.raw, nuc.raw)


def _sig(x: float, n: int = 7) -> float:
    return float(f"{x:.{n}g}")


# -- energy: masses and neutrinos -----------------------------------------------------
#
# The explorer's energy generation rate is Σ flux · Q · N_A (lib/rates/energy.ts)
# with Q from the nuclei's atomic mass excesses (AME2020, as pynucastro holds
# them: `Nucleus.dm`), which is exactly pynucastro's
# RateCollection.evaluate_energy_generation (−N_A Σ Ẏ m c²) for these rates.
# With atomic masses a β⁺ decay's Q includes the annihilation of its positron,
# deposited in the gas. What the gas does not get is the neutrino's energy:
# each weak reaction carries the mean energy of its neutrino, `nu`.

# Mean neutrino energies of the solar neutrino sources: Bahcall, Neutrino
# Astrophysics (Cambridge University Press 1989), Table 6.1. ⁷Be: the 0.8631
# and 0.3855 MeV lines, 89.7% and 10.3%, averaged. The pep neutrino is a line
# at the reaction's Q (1.442 MeV).
NU_BAHCALL = {
    "p_p_to_d_beta_pos_reaclib": 0.2668,
    "p_p_to_d_electron_capture_reaclib": 1.442,
    "He3_p_to_He4_beta_pos_reaclib": 9.628,
    "Be7_to_Li7_electron_capture_reaclib": 0.897 * 0.8631 + 0.103 * 0.3855,
    "B8_to_He4_He4_beta_pos_reaclib": 6.735,
    "N13_to_C13_beta_pos_reaclib": 0.7063,
    "O15_to_N15_beta_pos_reaclib": 0.9964,
    "F17_to_O17_beta_pos_reaclib": 0.9977,
}

# The main laboratory branches (ENSDF, NNDC) of the other decays of the light
# networks: (fraction, level of the daughter in MeV, "b+" or "ec"). The γ
# rays of the level stay in the gas; only the neutrino leaves. A decay not
# listed here (the s-process's) is taken as ground state to ground state, an
# upper bound on its neutrino energy.
NU_BRANCHES = {
    "O14_to_N14_beta_pos_reaclib": [(0.9935, 2.3129, "b+"), (0.0054, 0.0, "b+")],
    "F18_to_O18_beta_pos_reaclib": [(0.9686, 0.0, "b+"), (0.0314, 0.0, "ec")],
    "Ne18_to_F18_beta_pos_reaclib": [(0.92, 0.0, "b+"), (0.077, 1.0416, "b+"), (0.003, 1.0807, "b+")],
    "Ne19_to_F19_beta_pos_reaclib": [(0.9999, 0.0, "b+")],
    "Na21_to_Ne21_beta_pos_reaclib": [(0.949, 0.0, "b+"), (0.051, 0.3507, "b+")],
    "Na22_to_Ne22_beta_pos_reaclib": [(0.903, 1.2745, "b+"), (0.096, 1.2745, "ec"), (0.0006, 0.0, "b+")],
    "Mg22_to_Na22_beta_pos_reaclib": [(0.532, 0.6573, "b+"), (0.457, 0.5830, "b+")],
    "Mg23_to_Na23_beta_pos_reaclib": [(0.918, 0.0, "b+"), (0.080, 0.4400, "b+")],
    "Al25_to_Mg25_beta_pos_reaclib": [(0.992, 0.0, "b+"), (0.008, 0.5847, "b+")],
    "Al26_to_Mg26_beta_pos_reaclib": [(0.817, 1.8087, "b+"), (0.156, 1.8087, "ec"), (0.027, 2.9383, "b+")],
    "Si26_to_Al26_beta_pos_reaclib": [(0.752, 0.2283, "b+"), (0.218, 1.0577, "b+"), (0.027, 1.8507, "b+")],
    "Si27_to_Al27_beta_pos_reaclib": [(0.9975, 0.0, "b+")],
}

NU_SOURCES = {
    "bahcall89": {"en": "Bahcall, Neutrino Astrophysics (1989), Table 6.1",
                  "it": "Bahcall, Neutrino Astrophysics (1989), tabella 6.1"},
    "ensdf": {"en": "allowed β spectrum over the main ENSDF branches",
              "it": "spettro β permesso sui rami principali ENSDF"},
    "gs": {"en": "allowed β spectrum, ground state to ground state (an upper bound)",
           "it": "spettro β permesso, da stato fondamentale a stato fondamentale (un limite superiore)"},
}

_ME = 0.51099895  # MeV
_ALPHA = 1 / 137.035999


def mean_beta_nu(T0: float, Z_daughter: int, sign: int) -> float:
    """Mean neutrino energy (MeV) of an allowed β decay of endpoint T0 (kinetic,
    MeV): spectrum p W (W0 − W)² F(Z, W), F the non-relativistic Fermi function
    (sign +1 for β⁻, −1 for β⁺). Reproduces Bahcall's ¹³N, ¹⁵O, ¹⁷F values to 0.1%."""
    if T0 <= 0:
        return 0.0
    from scipy.integrate import quad
    W0 = 1 + T0 / _ME

    def n(W):
        p = math.sqrt(max(W * W - 1, 1e-30))
        eta = sign * _ALPHA * Z_daughter * W / p
        x = 2 * math.pi * eta
        F = x / (1 - math.exp(-x)) if abs(x) > 1e-12 else 1.0
        return p * W * (W0 - W) ** 2 * F

    num = quad(lambda W: n(W) * (W0 - W) * _ME, 1, W0, limit=200)[0]
    den = quad(n, 1, W0, limit=200)[0]
    return num / den


def neutrino(r) -> dict | None:
    """{MeV, src}: the mean energy a weak reaction's neutrino carries away."""
    if not r.weak:
        return None
    if r.fname in NU_BAHCALL:
        return {"MeV": round(NU_BAHCALL[r.fname], 4), "src": "bahcall89"}
    parent = r.reactants[0]
    daughter = max(r.products, key=lambda n: n.A)
    Q = parent.dm - sum(n.dm for n in r.products)  # atomic masses: Q_EC (β⁺) or Q_β⁻
    if r.weak_type == "beta_neg":
        return {"MeV": round(mean_beta_nu(Q, daughter.Z, +1), 4), "src": "gs"}
    if r.weak_type == "electron_capture":
        return {"MeV": round(Q, 4), "src": "gs"}
    branches = NU_BRANCHES.get(r.fname)
    src = "ensdf"
    if branches is None:
        branches, src = [(1.0, 0.0, "b+")], "gs"
    tot = sum(f for f, _, _ in branches)
    e = 0.0
    for f, level, mode in branches:
        if mode == "ec" or Q - level - 2 * _ME <= 0:
            e += f * (Q - level)
        else:
            e += f * mean_beta_nu(Q - level - 2 * _ME, daughter.Z, -1)
    return {"MeV": round(e / tot, 4), "src": src}


# -- export ----------------------------------------------------------------------------

def rate_json(r, index: dict, sources: dict, atlas_ids) -> dict:
    """One reaction of the schema."""
    sets = []
    for s in r.sets:
        lp = s.labelprops
        sets.append({
            "a": [float(c) for c in s.a],
            "set": lp[0:4].strip(),
            # n non-resonant, r resonant, w weak, s spontaneous decay
            "flag": lp[4].strip() or "n",
        })
    labels = sorted({s["set"] for s in sets})
    target = _split(r)[0]
    return {
        "id": r.fname,
        "label": label(r),
        "atlas": atlas_id(r, atlas_ids),
        "target": index[target],
        "reactants": [index[n] for n in r.reactants],
        "products": [index[n] for n in r.products],
        "prefactor": float(r.prefactor),
        "densExp": int(r.dens_exp),
        "ye": bool(r.use_ye_weighting),
        "screen": [[a.Z, a.A, b.Z, b.A] for a, b in r.screening_pairs],
        "Q_MeV": round(float(r.Q), 4),
        "chapter": int(r.chapter),
        "weak": bool(r.weak),
        "weakType": r.weak_type or None,
        # Cyburt et al. 2010 fit REACLIB rates for 10⁷–10¹⁰ K.
        "rate": {"kind": "reaclib", "sets": sets, "validity_T9": [0.01, 10.0]},
        "sources": rate_sources(r.fname, labels, sources),
        **({"nu": neutrino(r)} if r.weak else {}),
    }


def _first_author(authors: str) -> str:
    """The first author's surname, from "J. Skowronski et al.", "A. Di Leva, …",
    "Angulo C.", "Descouvemont, P", "G R Caughlan" or "Guo et al"."""
    a = authors.split("(")[0].replace(" et al.", "").replace(" et al", "").strip()
    if not a:
        return ""
    first, _, rest = a.partition(",")
    toks = first.split()
    if len(toks) == 1 and rest.strip() and len(rest.strip().rstrip(".")) <= 2:
        return toks[0]  # "Descouvemont, P"
    words = [t for t in toks if not t.endswith(".") and not (len(t) == 1 and t.isupper())]
    if toks and toks[-1].endswith(".") and words:
        return " ".join(words)  # "Angulo C."
    # surname after the initials: "A. Di Leva", "K. J. Kelly", "G R Caughlan"
    i = 0
    while i < len(toks) - 1 and (toks[i].endswith(".") or (len(toks[i]) == 1 and toks[i].isupper())):
        i += 1
    return " ".join(toks[i:])


def _cite(ref: dict) -> dict:
    """An atlas reference → {short, doi}: "Skowronski et al. 2023, Phys. Rev. Lett. 131, 162701"."""
    journal = str(ref.get("journal", "")).split(" (")[0]
    many = " et al." in ref.get("authors", "") or ref.get("authors", "").count(",") > 1
    short = f"{_first_author(ref.get('authors', ''))}{' et al.' if many else ''} {ref.get('year', '')}"
    return {"short": f"{short}, {journal}" if journal else short, "doi": ref.get("doi")}


SOLAR_FUSION = {"adelberger2011": "Solar Fusion II", "acharya2025": "Solar Fusion III"}


def newer_note(rj: dict, meta: dict) -> dict | None:
    """REACLIB's sources for a reaction, and the underground measurements and
    evaluations of the atlas that are newer than all of them."""
    years = [int(s["year"]) for s in rj["sources"] if str(s.get("year", "")).isdigit()]
    if not years:
        return None
    since = max(years)
    meas = [m for m in meta["measured"] if m["year"] > since]
    evals = [e for e in meta["evaluations"] if int(e.get("year", 0)) > since]
    if not meas and not evals:
        return None
    sets = ", ".join(f"{s['set']} ({(_first_author(s.get('author', '')) + ' ').lstrip()}{s.get('year', '')})"
                     for s in rj["sources"])
    parts_en, parts_it = [], []
    seen = set()
    for m in meas:
        for r in m["refs"]:
            if r["id"] in seen:
                continue
            seen.add(r["id"])
            lab = "LUNA" if m["luna"] else m["facility_name"]
            parts_en.append(f"{lab}, {_cite(r)['short']}")
            parts_it.append(f"{lab}, {_cite(r)['short']}")
    for e in evals:
        name = SOLAR_FUSION.get(e["id"])
        c = _cite(e)["short"]
        parts_en.append(f"evaluation: {name + ' (' + c + ')' if name else c}")
        parts_it.append(f"valutazione: {name + ' (' + c + ')' if name else c}")
    return {"en": f"REACLIB: {sets}. Newer: {'; '.join(parts_en)}.",
            "it": f"REACLIB: {sets}. Più recenti: {'; '.join(parts_it)}."}


# the evaluated rates and whether they ship: scripts/rates/rate_alternatives.py
from rate_alternatives import evaluated_rate  # noqa: E402,F401


def screening_constants() -> dict:
    """The temperature-independent factors of pynucastro's PlasmaState."""
    return {
        "method": "screen5",
        "co2": float(math.cbrt(27 * math.pi**2 * constants.q_e**4 * constants.m_u_C18
                               / (2 * constants.k * constants.hbar**2)) / 3),
        "aaFactor": float(constants.q_e**2 / (math.cbrt(3 * constants.m_u_C18 / (4 * math.pi)) * constants.k)),
        "NA": float(constants.N_A),
    }


def scenario_json(s: dict, nucs) -> dict:
    """A scenarios.yaml entry, its composition resolved for these nuclei."""
    X = resolve_composition(s["composition"])
    # PyYAML reads 1.0e9 (no sign in the exponent) as a string
    time = float(s["time"]) if "time" in s else float(s["time_yr"]) * YR
    out = {
        "id": s["id"],
        "name": s["name"], "name_it": s["name_it"],
        "short": s.get("short", s["name"]), "short_it": s.get("short_it", s["name_it"]),
        "T9": float(s["T9"]), "rho": float(s["rho"]), "time_s": time,
        "until": s.get("until"),
        "X": {n.raw: _sig(X.get(comp_key(n), 0.0)) for n in nucs},
        "source": s["source"], "source_it": s["source_it"],
        "note": s.get("note"), "note_it": s.get("note_it"),
        "power": s["power"],
    }
    if "history" in s:
        out["profile"] = history_profile(s["history"], time)
    if "extra" in s:
        out["extra"] = s["extra"]
    return out


def history_profile(h: dict, time_s: float) -> dict:
    """A scenarios.yaml `history` → the profile the solver interpolates.

    kind cooling: the burn starts at the peak and cools exponentially,
    T(t) = T_peak e^(−t/τ), while the envelope expands adiabatically,
    ρ(t) = ρ_peak (T/T_peak)^n (n = 3 for a radiation-dominated gas, γ = 4/3).
    Sampled every τ/8 (linear interpolation of T is then good to 0.2%).
    """
    if h.get("kind") != "cooling":
        raise ValueError(f"unknown history kind {h.get('kind')!r}")
    tau = float(h["tau_s"])
    n = float(h.get("rho_exp", 3))
    m = int(math.ceil(time_s / (tau / 8)))
    ts = [time_s * i / m for i in range(m + 1)]
    T = [math.exp(-t / tau) for t in ts]
    return {
        "kind": "cooling", "tau_s": tau, "rho_exp": n,
        "t_s": [_sig(t) for t in ts], "T": [_sig(x) for x in T], "rho": [_sig(x ** n) for x in T],
    }


def export_network(spec: dict, scenarios: dict | None = None, *, atlas_ids=frozenset(),
                   title: dict | None = None, libfile: str = LIBFILE, rates=None, nuclei=None,
                   hl: dict | None = None, atlas_meta: dict | None = None) -> dict:
    """A network spec (a networks.yaml entry) → the schema's dict.

    `scenarios` maps ids to scenarios.yaml entries; `atlas_ids` holds the
    atlas reaction ids rates may link to; `title` is {en, it}. `rates` and
    `nuclei` override the selection (a caller that built its own list).
    `atlas_meta` (build.py: atlas_meta) gives each atlas reaction its
    underground measurements and evaluations: they become the reaction's
    `measured` list and, when newer than its REACLIB sets, its `ui.newer`
    note (a hand-written `newer` in networks.yaml is kept after it).
    """
    hl = nubase_halflives() if hl is None else hl
    if rates is None:
        nucs, rates = spec_rates(spec, libfile, hl)
    else:
        nucs = nuclei
    index = {n: i for i, n in enumerate(nucs)}
    sources = load_sources()
    ids = {r.fname for r in rates}
    ui = {k: spec.get(k) for k in ("key", "reference", "fuel", "cycle", "show", "groups", "knobs", "track", "notes",
                                   "newer", "not_modelled")}
    grouped = [r for g in (ui.get("groups") or []) for r in g["reactions"]]
    for k in ((ui.get("key") or []) + (ui.get("cycle") or []) + grouped + list(ui.get("newer") or {})
              + ([ui["reference"]] if ui.get("reference") else [])):
        if k not in ids:
            raise ValueError(f"{spec['id']}: {k} is not a rate of the network")
    reactions = [rate_json(r, index, sources, atlas_ids) for r in rates]
    for rj in reactions:
        alt = evaluated_rate(rj["id"])
        if alt:
            rj["alternatives"] = [alt]
    if atlas_meta:
        auto = {}
        for rj in reactions:
            m = atlas_meta.get(rj["atlas"] or "")
            if not m:
                continue
            if m["measured"]:
                rj["measured"] = [{"facility": x["facility"], "name": x["facility_name"], "luna": x["luna"],
                                   "year": x["year"], "refs": [_cite(r) for r in x["refs"]]} for x in m["measured"]]
            note = newer_note(rj, m)
            if note:
                auto[rj["id"]] = note
        hand = ui.get("newer") or {}
        ui["newer"] = {k: ({"en": f"{auto[k]['en']} {hand[k]['en']}", "it": f"{auto[k]['it']} {hand[k]['it']}"}
                           if k in auto and k in hand else auto.get(k) or hand[k])
                       for k in list(auto) + [k for k in hand if k not in auto]} or None
    solar = lodders()
    return {
        "schema": SCHEMA,
        "schema_version": SCHEMA_VERSION,
        "id": spec["id"],
        "family": spec.get("family"),
        "title": title or {"en": spec["id"], "it": spec["id"]},
        "provenance": {
            "library": "JINA REACLIB",
            "snapshot": libfile,
            "tool": f"pynucastro {pyna.__version__}",
            "generated": _dt.date.today().isoformat(),
            "reverse_rates": False,
        },
        "units": UNITS,
        # NUBASE2020 half-lives (the atlas' table), pynucastro's where it has none
        "nuclei": [{"name": n.raw, "Z": n.Z, "A": n.A, "label": sci(n), "code": code(n),
                    "halfLife_s": (None if not math.isfinite(half_life(n, hl)) else half_life(n, hl)),
                    # AME2020 atomic mass excess, as pynucastro has it (the energy's Q values)
                    "dm_MeV": float(n.dm)} for n in nucs],
        "reactions": reactions,
        "ui": ui,
        "scenarios": [scenario_json(scenarios[s], nucs) for s in spec.get("scenarios", [])] if scenarios else [],
        "solar": {n.raw: _sig(solar.get(comp_key(n), 0.0)) for n in nucs},
        # tolerances the explorer runs this network with (optional)
        "solver": {k: float(v) for k, v in (spec.get("solver") or {}).items()},
        "screening": screening_constants(),
        "energy": {"masses": "AME2020 atomic mass excesses (pynucastro Nucleus.dm)",
                   "MeV2erg": float(constants.MeV2erg), "nu_sources": NU_SOURCES},
    }


def s_process_rates(spec: dict, libfile: str = LIBFILE, hl: dict | None = None):
    """(nuclei, rates) of a reduced s-process network (networks.yaml, builder: sprocess).

    Light nuclei (`light`): every forward REACLIB rate among them (the
    neutron sources, poisons and helium burning). Heavy nuclei: the nuclei of
    Lodders' solar mixture from `heavy.zmin` to `heavy.zmax`, closed under
    neutron capture and decay: the (Z, A+1) of every nucleus that lives
    longer than `heavy.extend_halflife_s` is added, and so is the product of
    every decay, until nothing new appears. Between heavy nuclei only (n,γ)
    and decays (β±, electron capture, α) are kept: charged-particle reactions
    on them are negligible at these temperatures. Laboratory half-lives
    throughout (REACLIB weak rates); reverse rates left out.
    """
    lib = library(libfile)
    hl = nubase_halflives() if hl is None else hl
    h = spec["heavy"]
    zmin, zmax, ext = h["zmin"], h["zmax"], float(h["extend_halflife_s"])
    light = pyna.Nucleus.cast_list(spec["light"])

    def tau(n):
        return half_life(n, hl)

    by: dict = {}
    for r in lib.get_rates():
        if any(st.labelprops[5] == "v" for st in r.sets):
            continue
        heavy = [n for n in r.reactants if n.Z >= zmin]
        if not heavy:
            continue
        names = [n.raw for n in r.reactants]
        if len(names) == 2 and "n" in names and len(r.products) == 1:
            by.setdefault(heavy[0], []).append(("ng", r))
        elif len(names) == 1 and tau(heavy[0]) <= LONG_LIVED_S:
            by.setdefault(heavy[0], []).append(("decay", r))
    S = {pyna.Nucleus(k) for k in LODDERS_DATA if zmin <= pyna.Nucleus(k).Z <= zmax}
    changed = True
    while changed:
        changed = False
        for n in list(S):
            for kind, r in by.get(n, []):
                if kind == "ng" and tau(n) < ext:
                    continue
                for p in r.products:
                    if zmin <= p.Z <= zmax and p not in S:
                        S.add(p)
                        changed = True
    heavy = sorted(S, key=lambda n: (n.A, n.Z))
    nucs = light + heavy
    allowed = set(nucs)
    rates = list(lib.linking_nuclei(light, with_reverse=False, print_warning=False).get_rates())
    for n in heavy:
        for kind, r in by.get(n, []):
            if kind == "ng" and tau(n) < ext:
                continue
            if all(p in allowed for p in r.products):
                rates.append(r)
    rates = lab_decays(rates, hl)
    rates.sort(key=lambda r: (_heaviest(list(r.reactants)).A, _heaviest(list(r.reactants)).Z,
                              len(r.reactants) == 1, r.fname))
    return nucs, rates


def spec_rates(spec: dict, libfile: str = LIBFILE, hl: dict | None = None):
    """(nuclei, rates) for any networks.yaml entry."""
    if spec.get("builder") == "sprocess":
        return s_process_rates(spec, libfile, hl)
    return network_rates(spec["nuclei"], spec.get("select", "all"), spec.get("include", ()),
                         spec.get("exclude", ()), libfile, hl)


def python_network(rates):
    """pynucastro's own PythonNetwork of exactly these rates."""
    return pyna.PythonNetwork(rates=rates)

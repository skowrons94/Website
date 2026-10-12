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
    nuclei[]      {name, Z, A, label, code, halfLife_s}   (NUBASE2020, null when stable)
    reactions[]   {id, label, atlas, target, reactants[idx], products[idx], prefactor,
                   densExp, ye, screen[[Z1,A1,Z2,A2]], Q_MeV, chapter, weak,
                   weakType, rate{kind, ...}, sources[]}
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
        "sources": [{"set": l, **sources.get(l, {})} for l in labels],
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


EVALUATED = Path(__file__).resolve().parent / "evaluated"


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
                    "halfLife_s": (None if not math.isfinite(half_life(n, hl)) else half_life(n, hl))} for n in nucs],
        "reactions": reactions,
        "ui": ui,
        "scenarios": [scenario_json(scenarios[s], nucs) for s in spec.get("scenarios", [])] if scenarios else [],
        "solar": {n.raw: _sig(solar.get(comp_key(n), 0.0)) for n in nucs},
        # tolerances the explorer runs this network with (optional)
        "solver": {k: float(v) for k, v in (spec.get("solver") or {}).items()},
        "screening": screening_constants(),
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

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
    nuclei[]      {name, Z, A, label, code, halfLife_s}
    reactions[]   {id, label, atlas, target, reactants[idx], products[idx], prefactor,
                   densExp, ye, screen[[Z1,A1,Z2,A2]], Q_MeV, chapter, weak,
                   weakType, rate{kind, ...}, sources[]}
                  rate.kind "reaclib": {sets[{a[7], set, flag}], validity_T9}
                  (a later kind "table" would carry {T9[], log10[]} instead)
    ui            {key[], reference, fuel, cycle[], show[]}  (what to show first)
    scenarios[]   {id, name, name_it, T9, rho, time_s, until, X{name: X}, ...}
    solar         Lodders mass fractions of the network's nuclei
    screening     constants of pynucastro's screen5 plasma factors

The ydot term of a reaction is, exactly as in pynucastro's generated
networks,

    prefactor · ρ^densExp · (Ye if ye) · Π Y_reactant · λ(T9) · e^{h_screen}

where λ is N_A^{n−1}⟨σv⟩ for n reactants (s⁻¹ for a decay).
"""

from __future__ import annotations

import csv
import datetime as _dt
import math
from pathlib import Path

import pynucastro as pyna
from pynucastro.constants import constants
from pynucastro.nucdata.composition import LODDERS_DATA

SCHEMA = "skowronski.rates.network"
SCHEMA_VERSION = 1
LIBFILE = "reaclib_default2_20250330"
YR = 3.15576e7  # Julian year, s

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
            out[label_.strip()] = {
                "author": author.strip(),
                "title": title.replace("&gamma;", "γ").replace("&alpha;", "α").strip(),
                "ref": publisher.strip(),
                "year": year.strip(),
                "url": url.strip() if url.strip() not in ("-", "") else None,
            }
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


def network_rates(nuclei, select="all", include=(), exclude=(), libfile: str = LIBFILE):
    """(nuclei, rates): the forward REACLIB rates linking `nuclei`, filtered.

    `select` is a SELECTORS key or a function rate → bool; `include` and
    `exclude` are pynucastro rate names (fname) added or removed after it.
    """
    nucs = pyna.Nucleus.cast_list(nuclei)
    sub = library(libfile).linking_nuclei(nucs, with_reverse=False, print_warning=False)
    keep = SELECTORS[select] if isinstance(select, str) else select
    inc, exc = set(include), set(exclude)
    rates = [r for r in sub.get_rates() if (keep(r) or r.fname in inc) and r.fname not in exc]
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
        "T9": float(s["T9"]), "rho": float(s["rho"]), "time_s": time,
        "until": s.get("until"),
        "X": {n.raw: _sig(X.get(comp_key(n), 0.0)) for n in nucs},
        "source": s["source"], "source_it": s["source_it"],
        "note": s.get("note"), "note_it": s.get("note_it"),
    }
    for k in ("history", "extra"):
        if k in s:
            out[k] = s[k]
    return out


def export_network(spec: dict, scenarios: dict | None = None, *, atlas_ids=frozenset(),
                   title: dict | None = None, libfile: str = LIBFILE, rates=None, nuclei=None) -> dict:
    """A network spec (a networks.yaml entry) → the schema's dict.

    `scenarios` maps ids to scenarios.yaml entries; `atlas_ids` holds the
    atlas reaction ids rates may link to; `title` is {en, it}. `rates` and
    `nuclei` override the selection (a caller that built its own list).
    """
    if rates is None:
        nucs, rates = network_rates(spec["nuclei"], spec.get("select", "all"), spec.get("include", ()),
                                    spec.get("exclude", ()), libfile)
    else:
        nucs = nuclei
    index = {n: i for i, n in enumerate(nucs)}
    sources = load_sources()
    ids = {r.fname for r in rates}
    ui = {k: spec.get(k) for k in ("key", "reference", "fuel", "cycle", "show", "groups")}
    for k in (ui.get("key") or []) + (ui.get("cycle") or []) + ([ui["reference"]] if ui.get("reference") else []):
        if k not in ids:
            raise ValueError(f"{spec['id']}: {k} is not a rate of the network")
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
        "nuclei": [{"name": n.raw, "Z": n.Z, "A": n.A, "label": sci(n), "code": code(n),
                    "halfLife_s": (None if n.tau in ("stable", None) else float(n.tau))} for n in nucs],
        "reactions": [rate_json(r, index, sources, atlas_ids) for r in rates],
        "ui": ui,
        "scenarios": [scenario_json(scenarios[s], nucs) for s in spec.get("scenarios", [])] if scenarios else [],
        "solar": {n.raw: _sig(solar.get(comp_key(n), 0.0)) for n in nucs},
        "screening": screening_constants(),
    }


def python_network(rates):
    """pynucastro's own PythonNetwork of exactly these rates."""
    return pyna.PythonNetwork(rates=rates)

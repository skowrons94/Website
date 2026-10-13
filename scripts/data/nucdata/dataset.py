"""From a parsed EXFOR entry to dataset records: one per (subentry, reaction
pointer), each with its metadata and its data points in normalised units.

Rules (see scripts/data/README.md for the full list):

* frames are never mixed: every point keeps the energy as given (`E`,
  `E_frame` = lab | cm | lab-res | cm-res) and gets both `E_lab` and `E_cm`
  computed with AME2020 masses; angles keep their frame (`ang_frame`);
* extrapolated rows (a FLAG whose BIB text says so, or an incident energy of
  exactly zero) are moved to `excluded`, never kept as points;
* error components stay separate: every error column is kept, in the
  value's units, and `d_tot` says where it came from (given / combined);
* nothing is recomputed silently: S-factors stay S-factors, relative data
  stay relative (`flags` carries "relative").
"""

import math
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from . import corrections, dictionary, masses, measured
from .x4 import Entry, Item, Primitive, Subentry, Table, is_complex, number, primitives

# -- particles -----------------------------------------------------------

LIGHT = {"N": (1, 0), "P": (1, 1), "D": (2, 1), "T": (3, 1), "HE3": (3, 2), "A": (4, 2),
         "G": (0, 0), "E": (0, -1)}
LIGHT_LABEL = {"N": "n", "P": "p", "D": "d", "T": "t", "HE3": "3He", "A": "a", "G": "g",
               "E": "e", "EL": "el", "INL": "inl", "X": "x", "TOT": "tot", "NON": "non",
               "ABS": "abs", "F": "f", "SCT": "sct", "B-": "b-", "B+": "b+", "PI": "pi",
               "HE6": "6He", "XN": "xn", "XP": "xp"}

_NUC = re.compile(r"^(\d+)-([A-Z]+)-(\d+)(?:-([A-Z0-9/]+))?$")


def nuclide(code: str) -> Optional[Tuple[int, int, str]]:
    """'7-N-14' -> (Z, A, isomer flag); A = 0 for a natural element."""
    m = _NUC.match(code.strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(3)), m.group(4) or ""


def particle(code: str) -> Optional[Tuple[int, int]]:
    """(A, Z) of an SF2 projectile code: P, A, HE3, or a nuclide 6-C-12."""
    if code in LIGHT:
        return LIGHT[code]
    n = nuclide(code)
    if n:
        return n[1], n[0]
    return None


def nuclide_label(Z: int, A: int, iso: str = "") -> str:
    sym = masses.symbol(Z)
    if Z == 0 and A == 1:
        return "n"
    base = f"nat{sym}" if A == 0 else f"{A}{sym}"
    return base + (f"-{iso.lower()}" if iso else "")


def particle_label(code: str) -> str:
    if code in LIGHT_LABEL:
        return LIGHT_LABEL[code]
    n = nuclide(code)
    if n:
        return nuclide_label(n[0], n[1], n[2])
    # process codes like 2N, N+P, 2A: label each token
    out = []
    for tok in code.split("+"):
        m = re.match(r"^(\d*)([A-Z0-9]+)$", tok)
        if m and m.group(2) in LIGHT_LABEL:
            out.append(m.group(1) + LIGHT_LABEL[m.group(2)])
        else:
            out.append(tok.lower())
    return "+".join(out)


def reaction_key(p: Primitive) -> str:
    """'7-N-14(P,G)' -> '14N(p,g)': target(projectile,process), site notation."""
    t = nuclide(p.target)
    tl = nuclide_label(*t) if t else p.target
    return f"{tl}({particle_label(p.projectile)},{particle_label(p.process)})"


def reaction_slug(key: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", key.replace("+", "p")).strip("-")


# -- quantity classes ----------------------------------------------------

QUANTITY_CLASSES = {
    "sigma": "cross section",
    "S": "astrophysical S-factor",
    "dsigma": "differential cross section dσ/dΩ",
    "legendre": "Legendre coefficients of dσ/dΩ",
    "ddx": "double-differential or energy-differential cross section",
    "pol": "polarisation observable (analysing power, VAP, TAP, ...)",
    "yield": "thick-target or product yield",
    "strength": "resonance strength ωγ",
    "width": "resonance width or other resonance parameter",
    "macs": "Maxwellian-averaged cross section",
    "sacs": "spectrum-averaged cross section",
    "rate": "reaction rate or <σv>",
    "ratio": "ratio or other combination of quantities",
    "integral": "resonance integral",
    "other": "other quantity",
}


def quantity_class(p: Primitive, complex_: bool) -> str:
    sf6, mods = p.parameter, set(p.modifier.split("/")) if p.modifier else set()
    if complex_ or "RAT" in sf6.split("/"):
        return "ratio"
    if sf6 == "SIG":
        if "MXW" in mods:
            return "macs"
        if "SPA" in mods or "FIS" in mods or "AV" in mods:
            return "sacs"
        if "SFC" in mods:
            return "S"
        return "sigma"
    if sf6 == "DA":
        if mods & {"LEG", "RS"} and "LEG" in p.modifier:
            return "legendre"
        return "dsigma"
    if sf6.startswith("POL"):
        return "pol"
    if sf6 in ("DA/DE", "DA/DA", "DA/DA/DE", "DE", "DA/DP", "DP", "SPC") or (
            sf6.startswith("DA/") and "POL" not in sf6):
        return "ddx"
    if sf6 in ("TTY", "PY", "TTD", "DT") or sf6.startswith(("PY/", "TTY")):
        return "yield"
    if sf6 == "WID/STR":
        return "strength"
    if sf6.startswith("WID") or sf6 in ("EN", "J", "D", "STF", "ARE", "L"):
        return "width"
    if sf6 in ("SGV", "RR"):
        return "rate"
    if sf6 == "RI":
        return "integral"
    return "other"


# -- units ----------------------------------------------------------------

FAMILY_UNITS = {
    # family: (multiplier applied after the dictionary factor, unit label)
    "E": (1e-6, "MeV"),
    "B": (1.0, "b"),
    "DA": (1.0, "b/sr"),
    "B*E": (1e-6, "MeV b"),
    "DAE": (1e6, "b/(sr MeV)"),
    "DE": (1e6, "b/MeV"),
    "A": (1.0, "deg"),
    "NO": (1.0, ""),
    "1/E": (1e6, "1/MeV"),
}


def unit_scale(unit: str) -> Tuple[Optional[float], str, str]:
    """(factor to the normalised unit, normalised unit label, family) for an
    EXFOR unit code; (None, unit, '') when the unit has no known conversion."""
    u = dictionary.unit(unit)
    if not u:
        return None, unit, ""
    _, fam, factor = u
    if fam == "PC":
        return 1.0, "%", "PC"
    if fam in FAMILY_UNITS and factor is not None:
        mult, label = FAMILY_UNITS[fam]
        return factor * mult, label, fam
    if factor is not None and fam:
        return factor, unit, fam
    return None, unit, fam


# -- headings ----------------------------------------------------------

E_PRIORITY = [("EN", "lab"), ("EN-MEAN", "lab"), ("EN-APRX", "lab"), ("EN-CM", "cm"),
              ("EN-RES", "lab-res"), ("EN-RES-CM", "cm-res"), ("EN-DUMMY", "lab")]
E_RANGE = [("EN-MIN", "EN-MAX", "lab"), ("EN-CM-MIN", "EN-CM-MAX", "cm"),
           ("EN-RES-MIN", "EN-RES-MAX", "lab-res")]
ANG_HEADS = [("ANG", "lab"), ("ANG-CM", "cm"), ("ANG-APRX", "lab")]
COS_HEADS = [("COS", "lab"), ("COS-CM", "cm")]
LEVEL_HEADS = ["E-LVL", "E-EXC", "E-LVL-INI", "E-LVL-MEAN", "E-EXC-MEAN", "E-LVL1", "E-LVL-FIN"]
VALUE_HEADS = [("DATA", "lab"), ("DATA-CM", "cm"), ("DATA-APRX", "lab"), ("DATA-AP-CM", "cm")]
ERR_HEAD = re.compile(r"^(DATA-ERR\d?|ERR-T|ERR-S|ERR-SYS|ERR-\d+|ERR-DIG|DATA-ERR[+-]?)$")


@dataclass
class Column:
    name: str
    unit: str
    values: List[Optional[float]]   # one per row (constant columns are broadcast)
    common: bool
    raw: List[str] = field(default_factory=list)


def _columns(tables: List[Tuple[Optional[Table], bool]], pointer: str) -> Dict[str, Column]:
    cols: Dict[str, Column] = {}
    nrows = 1
    for tab, is_common in tables:
        if tab is not None and not is_common:
            nrows = len(tab.rows)
    for tab, is_common in tables:
        if tab is None:
            continue
        seen: Dict[str, int] = {}
        for j, (name, ptr) in enumerate(tab.heads):
            if ptr and ptr != pointer:
                continue
            # The same heading twice in one table (an uncertainty given both
            # absolute and in per cent, row by row): keep both, as NAME and NAME#2.
            seen[name] = seen.get(name, 0) + 1
            if seen[name] > 1:
                name = f"{name}#{seen[name]}"
            unit = tab.units[j] if j < len(tab.units) else ""
            if is_common:
                raw = tab.rows[0][j] if tab.rows and j < len(tab.rows[0]) else ""
                vals = [number(raw)] * nrows
                raws = [raw] * nrows
            else:
                raws = [r[j] if j < len(r) else "" for r in tab.rows]
                vals = [number(x) for x in raws]
            # A later table (the subentry's own) overrides the entry-wide COMMON.
            cols[name] = Column(name, unit, vals, is_common, raws)
    return cols


def _scaled(col: Column) -> Tuple[List[Optional[float]], str, str]:
    f, label, fam = unit_scale(col.unit)
    if f is None:
        return list(col.values), col.unit, fam
    return [None if v is None else v * f for v in col.values], label, fam


# -- BIB helpers ----------------------------------------------------------

def _merge_bib(first: Optional[Subentry], sub: Subentry, pointer: str) -> Dict[str, List[Item]]:
    """Subentry 001 holds entry-wide information; a keyword in the subentry
    replaces it, except for the cumulative ones listed below."""
    cumulative = {"ERR-ANALYS", "FLAG", "HISTORY", "STATUS", "COMMENT", "CORRECTION", "MISC-COL"}
    out: Dict[str, List[Item]] = {}
    for src in (first, sub):
        if src is None:
            continue
        for kw, items in src.bib.items():
            mine = [i for i in items if not i.pointer or i.pointer == pointer]
            if not mine:
                continue
            if kw in cumulative and kw in out:
                out[kw] = out[kw] + mine
            else:
                out[kw] = list(mine)
    return out


def _codes(items: List[Item]) -> List[str]:
    out = []
    for it in items:
        if it.code:
            out += [c.strip() for c in it.code.split(",") if c.strip()]
    return out


def _authors(items: List[Item]) -> List[str]:
    if not items:
        return []
    code = items[0].code or items[0].free
    return [a.strip() for a in code.replace("\n", " ").split(",") if a.strip()]


def _surname(author: str) -> str:
    a = author.strip()
    if "." in a:
        a = a.rsplit(".", 1)[1]
    return a.strip()


_DOI = re.compile(r"#doi:\s*(\S+)", re.I)


def _references(items: List[Item]) -> List[dict]:
    refs = []
    journals = dictionary.load()["journals"]
    for it in items:
        code = it.code
        if not code:
            continue
        parts = code.split(",")
        rtype = parts[0].strip()
        ref = {"code": code, "type": rtype}
        if rtype == "J" and len(parts) > 1:
            ref["journal"] = journals.get(parts[1].strip(), parts[1].strip())
        y = _year_of(parts[-1] if parts else "")
        if y:
            ref["year"] = y
        doi = _DOI.search(it.text)
        if doi:
            ref["doi"] = doi.group(1).rstrip(".,;)")
        note = _DOI.sub("", it.free).strip()
        if note:
            ref["note"] = note[:200]
        refs.append(ref)
    return refs


def _year_of(token: str) -> Optional[int]:
    t = re.sub(r"[^0-9]", "", token.strip())
    if len(t) in (4, 6, 8) and 1900 < int(t[:4]) < 2100:
        return int(t[:4])
    if len(t) == 2:
        return 1900 + int(t)
    return None


STATUS_FLAGS = {"CURVE": "digitised", "SPSDD": "superseded", "PRELM": "preliminary",
                "OUTDT": "outdated-normalisation", "RNORM": "renormalised-by-compiler",
                "CRCTD": "corrected-by-compiler", "DEP": "dependent", "COREL": "correlated",
                "APRVD": "approved-by-author", "NCHKD": "not-checked", "UNOBT": "unobtainable"}


def _status(items: List[Item]) -> Tuple[List[str], Optional[str], List[dict]]:
    flags, superseded_by, out = [], None, []
    for it in items:
        parts = [p.strip() for p in it.code.split(",")] if it.code else []
        if not parts:
            continue
        code = parts[0]
        out.append({"code": code, "ref": ",".join(parts[1:]), "text": it.free[:200]})
        if code in STATUS_FLAGS:
            flags.append(STATUS_FLAGS[code])
        if code == "SPSDD" and len(parts) > 1 and parts[1]:
            superseded_by = parts[1]
    return flags, superseded_by, out


def _history(items: List[Item]) -> List[dict]:
    out = []
    for it in items:
        m = re.match(r"^(\d{6,8})([A-Z]?)", it.code or "")
        if not m:
            continue
        d = m.group(1)
        if len(d) == 6:
            d = ("19" if int(d[:2]) > 60 else "20") + d
        out.append({"date": f"{d[:4]}-{d[4:6]}-{d[6:8]}", "code": m.group(2), "text": it.free[:200]})
    return out


def _err_kind(name: str, text: str) -> str:
    if name in ("ERR-T", "DATA-ERR"):
        return "total"
    if name == "ERR-S":
        return "stat"
    if name == "ERR-SYS":
        return "sys"
    if name == "ERR-DIG":
        return "digitising"
    t = text.lower()
    if re.search(r"statist|counting|count rate", t):
        return "stat"
    if re.search(r"\btotal\b", t) and name.startswith("DATA-ERR"):
        return "total"
    return "sys"


def _err_texts(items: List[Item]) -> Dict[str, str]:
    out = {}
    for it in items:
        for c in (it.code or "").split(","):
            c = c.strip()
            if ERR_HEAD.match(c) or c.startswith(("EN-ERR", "MONIT-ERR", "ANG-ERR")):
                out[c] = (out.get(c, "") + " " + it.free).strip()[:160]
                break
    return out


def _flag_texts(items: List[Item]) -> Dict[float, str]:
    out = {}
    for it in items:
        v = number(it.code) if it.code else None
        if v is not None:
            out[v] = it.free
    return out


# -- indirect methods ------------------------------------------------------

# ANALYSIS codes (EXFOR dictionary 23) of an indirect method.
INDIRECT_CODES = {"TROJA", "ANC", "SURGT"}
# Free text of METHOD and ANALYSIS naming one.
INDIRECT_TEXT = re.compile(r"trojan|\bTHM\b|coulomb (dissociation|break-?up)|asymptotic normali[sz]ation|\bANCs?\b|surrogate",
                           re.I)
# Titles: only the unambiguous names. A title that mentions an ANC alone is
# not enough (Burtebaev 2008, A0819, a direct 12C(p,g) measurement, derives
# one from its data); an ANC analysis is coded (ANALYSIS ANC, SF9 DERIV).
INDIRECT_TITLE = re.compile(r"trojan|\bTHM\b|coulomb (dissociation|break-?up)|\bindirect\b|(via|through|from) the asymptotic normali[sz]ation",
                            re.I)


# -- the dataset ----------------------------------------------------------

@dataclass
class Dataset:
    meta: dict
    points: dict           # column name -> list
    excluded: List[dict]


def _round(v: Optional[float], sig: int = 7) -> Optional[float]:
    if v is None or v == 0:
        return v
    return float(f"{v:.{sig}g}")


def build(entry: Entry, sub: Subentry, item: Item, update: Optional[Tuple[str, int]],
          entry_history: List[dict]) -> Optional[Dataset]:
    """One dataset: the subentry's REACTION item (pointer) with the data it
    points to; None if the item has no reaction code."""
    first = entry.first if sub.number != "001" else None
    code = item.code
    if not code:
        return None
    prims = primitives(code)
    if not prims:
        return None
    cx = is_complex(code)
    p = prims[0]
    pointer = item.pointer
    bib = _merge_bib(first, sub, pointer)

    qclass = quantity_class(p, cx)
    tgt = nuclide(p.target)
    proj = particle(p.projectile)
    mods = set(p.modifier.split("/")) if p.modifier else set()

    flags = set()
    if "REL" in mods or "RTH" in mods:
        flags.add("relative")
    if p.data_type in ("CALC", "EVAL", "RECOM"):
        flags.add("not-experimental")
    if p.data_type == "DERIV":
        flags.add("derived")
    sflags, superseded_by, status = _status(bib.get("STATUS", []))
    flags.update(sflags)
    # The subentry's own history and status; the entry's (subentry 001) go
    # once into the shard's entry table (entry_history, entry_status).
    history = _history(sub.items("HISTORY")) if sub.number != "001" else []
    own_status = _status([i for i in sub.items("STATUS") if not i.pointer or i.pointer == pointer])[2]
    entry_status = _status(first.items("STATUS"))[2] if first else []
    if any(h["code"] == "D" for h in history + entry_history):
        flags.add("deleted")

    tables = [(first.common if first else None, True), (sub.common, True), (sub.data, False)]
    cols = _columns(tables, pointer)
    sid = f"{entry.id}.{sub.number}" + (f".{pointer}" if pointer else "")
    # Curated corrections (scripts/data/corrections.yaml), before anything reads a column.
    corrected = corrections.apply(cols, corrections.for_dataset(sid))
    if corrected:
        flags.add("corrected")
    nrows = len(sub.data.rows) if sub.data else (1 if sub.common else 0)

    # -- kinematics ------------------------------------------------------
    mt = mp = None
    cm_approx = False
    if tgt and proj and proj != (0, 0):
        mt = masses.nuclear_mass(tgt[1], tgt[0])
        mp = masses.nuclear_mass(proj[0], proj[1]) if proj[0] > 0 else None
        cm_approx = tgt[1] == 0

    # -- incident energy ---------------------------------------------------
    E, frame, e_unit_src = [None] * nrows, None, None
    for name, fr in E_PRIORITY:
        if name in cols:
            vals, unit, fam = _scaled(cols[name])
            if fam == "E":
                E, frame, e_unit_src = vals, fr, name
                was = getattr(cols[name], "renamed_from", None)
                if was:
                    e_unit_src = f"{was} (read as {name}: scripts/data/corrections.yaml)"
                break
    if frame is None:
        for lo, hi, fr in E_RANGE:
            if lo in cols and hi in cols:
                a, _, fa = _scaled(cols[lo])
                b, _, fb = _scaled(cols[hi])
                if fa == fb == "E":
                    E = [None if x is None or y is None else 0.5 * (x + y) for x, y in zip(a, b)]
                    frame, e_unit_src = fr, f"{lo}/{hi}"
                    break
    E_lab = E_cm = [None] * nrows
    if frame is not None:
        if mt and mp:
            if frame.startswith("lab"):
                E_lab = E
                E_cm = [None if v is None else masses.lab_to_cm(v, mp, mt) for v in E]
            else:
                E_cm = E
                E_lab = [None if v is None else masses.cm_to_lab(v, mp, mt) for v in E]
        elif frame.startswith("lab"):
            E_lab = E
        else:
            E_cm = E
    d_E = None
    for name in ("EN-ERR", "EN-RES-ERR", "EN-RSL-HW", "EN-RSL", "EN-RSL-FW"):
        if name in cols:
            vals, unit, fam = _scaled(cols[name])
            if fam == "E":
                d_E = vals
            elif fam == "PC" and E:
                d_E = [None if v is None or e is None else abs(v * e / 100) for v, e in zip(cols[name].values, E)]
            if d_E is not None:
                break

    kT = None
    for name in ("KT", "KT-DUMMY"):
        if name in cols:
            vals, unit, fam = _scaled(cols[name])
            if fam == "E":
                kT = vals
                break

    # -- angle -------------------------------------------------------------
    ang, ang_frame = None, None
    for name, fr in ANG_HEADS:
        if name in cols:
            ang, _, _ = _scaled(cols[name])
            ang_frame = fr
            break
    if ang is None:
        for name, fr in COS_HEADS:
            if name in cols:
                ang = [None if v is None or abs(v) > 1 else math.degrees(math.acos(v)) for v in cols[name].values]
                ang_frame = fr
                break
    if ang is None and "ANG-MIN" in cols and "ANG-MAX" in cols:
        a, _, _ = _scaled(cols["ANG-MIN"])
        b, _, _ = _scaled(cols["ANG-MAX"])
        ang = [None if x is None or y is None else 0.5 * (x + y) for x, y in zip(a, b)]
        ang_frame = "lab"

    # -- final level ---------------------------------------------------------
    lvl, lvl_name = None, None
    for name in LEVEL_HEADS:
        if name in cols:
            vals, _, fam = _scaled(cols[name])
            if fam == "E":
                lvl, lvl_name = vals, name
                break
    lvl_number = cols["LVL-NUMB"].values if "LVL-NUMB" in cols else None

    # -- value -------------------------------------------------------------
    val, val_frame, val_unit, val_fam, val_col = None, None, "", "", None
    lim = None
    for name, fr in VALUE_HEADS:
        if name in cols:
            val_col = cols[name]
            val, val_unit, val_fam = _scaled(val_col)
            val_frame = fr
            break
    # Limits: DATA-MAX alone is an upper limit, DATA-MIN alone a lower one,
    # both a range (kept as its midpoint), row by row, where DATA is blank.
    mx = cols.get("DATA-MAX") or cols.get("DATA-MX-CM")
    mn = cols.get("DATA-MIN") or cols.get("DATA-MN-CM")
    if mx or mn:
        a = _scaled(mn)[0] if mn else [None] * nrows
        b = _scaled(mx)[0] if mx else [None] * nrows
        if val is None:
            val_col = mx or mn
            _, val_unit, val_fam = _scaled(val_col)
            val_frame = "lab" if (mx or mn).name in ("DATA-MAX", "DATA-MIN") else "cm"
            val = [None] * nrows
        lim = [None] * nrows
        for i in range(nrows):
            if val[i] is not None:
                continue
            if a[i] is not None and b[i] is not None:
                val[i], lim[i] = 0.5 * (a[i] + b[i]), "range"
            elif b[i] is not None:
                val[i], lim[i] = b[i], "<"
            elif a[i] is not None:
                val[i], lim[i] = a[i], ">"
        if all(x is None for x in lim):
            lim = None
        else:
            flags.add("upper-limits")
    if val is None:
        val = [None] * nrows

    # -- errors ------------------------------------------------------------
    err_text = _err_texts(bib.get("ERR-ANALYS", []))
    err_cols: Dict[str, List[Optional[float]]] = {}
    components = []
    for name, col in cols.items():
        base = name.split("#")[0]
        if not ERR_HEAD.match(base):
            continue
        kind = _err_kind(base, err_text.get(base, ""))
        f, label, fam = unit_scale(col.unit)
        rel = fam == "PC"
        if rel:
            absv = [None if v is None or x is None else abs(v * x / 100) for v, x in zip(col.values, val)]
        elif f is not None and (fam == val_fam or not val_fam):
            absv = [None if v is None else abs(v * f) for v in col.values]
        elif col.unit == (val_col.unit if val_col else None):
            absv = [None if v is None else abs(v) for v in col.values]
        else:
            absv = [None] * nrows
        comp = {"name": name, "kind": kind, "where": "common" if col.common else "point",
                "unit": col.unit, "relative": rel}
        if col.common:
            comp["value"] = col.values[0] if col.values else None
        if base in err_text:
            comp["text"] = err_text[base]
        components.append(comp)
        if not all(v is None for v in absv):
            err_cols[name] = absv

    def quad(names):
        out = []
        for i in range(nrows):
            parts = [err_cols[n][i] for n in names if err_cols[n][i] is not None]
            out.append(math.sqrt(sum(x * x for x in parts)) if parts else None)
        return out

    total_names = [c["name"] for c in components if c["kind"] == "total" and c["name"] in err_cols]
    stat_names = [c["name"] for c in components if c["kind"] == "stat" and c["name"] in err_cols]
    sys_names = [c["name"] for c in components if c["kind"] == "sys" and c["name"] in err_cols]
    dig_names = [c["name"] for c in components if c["kind"] == "digitising" and c["name"] in err_cols]
    if any(n.split("#")[0] == "ERR-SYS" for n in sys_names):
        sys_names = [n for n in sys_names if n.split("#")[0] == "ERR-SYS"]
    d_stat = quad(stat_names) if stat_names else None
    d_sys = quad(sys_names) if sys_names else None
    d_tot, d_tot_src = None, None
    if total_names:
        # The given total, row by row; a row without it gets the components.
        name = "ERR-T" if "ERR-T" in total_names else total_names[0]
        d_tot, d_tot_src = list(err_cols[name]), name
        if stat_names or sys_names or dig_names:
            comb = quad(stat_names + sys_names + dig_names)
            filled = 0
            for i in range(nrows):
                if d_tot[i] is None and comb[i] is not None:
                    d_tot[i] = comb[i]
                    filled += 1
            if filled:
                d_tot_src = f"{name}, else combined:" + "+".join(stat_names + sys_names + dig_names)
    elif stat_names or sys_names or dig_names:
        names = stat_names + sys_names + dig_names
        d_tot, d_tot_src = quad(names), "combined:" + "+".join(names)
    if "ERR-DIG" in cols:
        flags.add("digitised")


    # -- flags per row -----------------------------------------------------
    flag_text = _flag_texts(bib.get("FLAG", []))
    flag_col = cols.get("FLAG").values if "FLAG" in cols else None

    keep, excluded = [], []
    for i in range(nrows):
        reason = None
        fv = flag_col[i] if flag_col else None
        if fv is not None:
            txt = flag_text.get(fv, "")
            if re.search(r"extrapol", txt, re.I):
                reason = f"extrapolated (FLAG {fv:g}: {txt.strip()})"
        if reason is None and frame in ("lab", "cm") and E[i] == 0 and tgt and proj and proj[1] > 0:
            reason = "incident energy 0: an extrapolated or derived value, not a measurement"
        if reason is None and val[i] is None:
            reason = "no value"
        if reason:
            excluded.append({"row": i, "reason": reason})
        else:
            keep.append(i)
    if any(r["reason"].startswith(("extrapolated", "incident energy 0")) for r in excluded):
        flags.add("has-extrapolated-rows")

    def pick(arr, sig=7):
        return None if arr is None else [_round(arr[i], sig) for i in keep]

    # The energy as given is E_lab (frame lab, lab-res) or E_cm (cm, cm-res);
    # the other one is computed (meta E_frame says which).
    given_lab = frame is not None and frame.startswith("lab")
    points = {"E_lab": pick(E_lab, 7 if given_lab else 6), "E_cm": pick(E_cm, 6 if given_lab else 7)}
    if d_E is not None:
        points["dE"] = pick(d_E, 4)
    if kT is not None:
        points["kT"] = pick(kT)
    if ang is not None:
        points["ang"] = pick(ang, 6)
    if lvl is not None:
        points["E_level"] = pick(lvl, 6)
    if lvl_number is not None:
        points["level_number"] = pick(lvl_number, 4)
    points["value"] = pick(val)
    if lim is not None:
        points["limit"] = [lim[i] for i in keep]
    if d_stat is not None:
        points["d_stat"] = pick(d_stat, 4)
    if d_sys is not None:
        points["d_sys"] = pick(d_sys, 4)
    if d_tot is not None:
        points["d_tot"] = pick(d_tot, 4)
    if flag_col is not None:
        points["flag"] = pick(flag_col, 4)
    # Point-wise error columns; one that is exactly d_tot, d_stat or d_sys is
    # not repeated (err_columns in meta says where each column went).
    err_where = {}
    for n in err_cols:
        if cols[n].common:
            continue
        if d_tot_src == n:
            err_where[n] = "d_tot"
        elif stat_names == [n]:
            err_where[n] = "d_stat"
        elif sys_names == [n] and n in err_cols:
            err_where[n] = "d_sys"
        else:
            err_where[n] = "err"
    errs = {n: pick(err_cols[n], 4) for n, w in err_where.items() if w == "err"}
    if errs:
        points["err"] = errs
    # Excluded rows, with what they said, for transparency.
    ex_rows = []
    for r in excluded:
        i = r["row"]
        ex_rows.append({"reason": r["reason"], "E": _round(E[i]), "E_frame": frame,
                        "E_level": _round(lvl[i]) if lvl else None, "value": _round(val[i]),
                        "d_tot": _round(d_tot[i], 4) if d_tot else None})

    # -- metadata ----------------------------------------------------------
    ref_items = bib.get("REFERENCE", [])
    refs = _references(ref_items)
    year = refs[0].get("year") if refs else None
    if year is None and sub.date[:4].isdigit():
        year = int(sub.date[:4])
    authors = _authors(bib.get("AUTHOR", []))
    inst_codes = []
    for c in _codes(bib.get("INSTITUTE", [])):
        if c not in inst_codes:
            inst_codes.append(c)
    fac = []
    for it in bib.get("FACILITY", []):
        parts = [x.strip() for x in (it.code or "").split(",") if x.strip()]
        if parts:
            fac.append({"code": parts[0], "name": dictionary.facility(parts[0]),
                        "institute": parts[1] if len(parts) > 1 else "",
                        "text": it.free[:240]})
    methods = _codes(bib.get("METHOD", []))
    detectors = _codes(bib.get("DETECTOR", []))
    monitor = []
    for it in bib.get("MONITOR", []):
        mp_ = primitives(it.code) if it.code else []
        monitor.append({"code": it.code, "reaction": reaction_key(mp_[0]) if mp_ else None,
                        "text": it.free[:240]})
    title = " ".join(i.free or i.text for i in bib.get("TITLE", [])).strip()
    qdesc = dictionary.quantity(",".join([p.branch, p.parameter, p.particle, p.modifier]).rstrip(","))

    finite = lambda arr: [x for x in (arr or []) if x is not None and math.isfinite(x)]
    ecm = finite(points["E_cm"])
    elab = finite(points["E_lab"])
    kts = finite(points.get("kT"))
    levels = sorted(set(round(x, 4) for x in finite(points.get("E_level"))))

    compound = None
    if tgt and proj and tgt[1] > 0:
        cZ, cA = tgt[0] + proj[1], tgt[1] + proj[0]
        compound = nuclide_label(cZ, cA)

    # Indirect methods (Trojan horse, Coulomb dissociation, ANC, surrogate):
    # EXFOR's ANALYSIS and METHOD codes, their free text, and the title.
    # The entry's (subentry 001) and the subentry's own items both count: a
    # subentry's ANALYSIS replaces the entry's in `bib`, but the method of the
    # experiment stays (La Cognata 2022, O2580: TROJA in 001, an average in .004).
    ind_items = (bib.get("METHOD", []) + bib.get("ANALYSIS", [])
                 + ((first.items("METHOD") + first.items("ANALYSIS")) if first else []))
    analysis = _codes(bib.get("ANALYSIS", []))
    ind_codes = set(_codes([i for i in ind_items if i.code]))
    method_text = " ".join(i.free for i in ind_items)
    if (ind_codes & INDIRECT_CODES or INDIRECT_TEXT.search(method_text)
            or INDIRECT_TITLE.search(title)):
        flags.add("indirect")

    # The per-point half of "lowest measured" (nucdata/measured.py).
    charged = bool(tgt and proj and tgt[0] > 0 and proj[1] > 0)
    threshold = measured.threshold_mev(tgt, proj, p.process)
    m_low = measured.lowest_by_sigma(points, charged, threshold, signed=qclass != "legendre")

    meta = {
        "id": sid,
        "entry": entry.id,
        "subentry": sub.number,
        "pointer": pointer,
        "code": code,
        "sf": [[x.target, x.projectile, x.process, x.product, x.branch, x.parameter, x.particle,
                x.modifier, x.data_type] for x in prims],
        "complex": cx,
        "reaction": reaction_key(p),
        "target": nuclide_label(*tgt) if tgt else p.target,
        "projectile": particle_label(p.projectile),
        "process": particle_label(p.process),
        "product": p.product,
        "compound": compound,
        "quantity": p.quantity(),
        "quantity_class": qclass,
        "quantity_text": (qdesc[0] if qdesc else ""),
        "E_frame": frame,
        "E_source": e_unit_src,
        "ang_frame": ang_frame,
        "value_frame": val_frame if (ang is not None or qclass in ("dsigma", "ddx", "pol", "legendre")) else None,
        "value_unit": val_unit,
        "cm_approx": cm_approx,
        "emin_cm": min(ecm) if ecm else None,
        "emax_cm": max(ecm) if ecm else None,
        "emin_lab": min(elab) if elab else None,
        "emax_lab": max(elab) if elab else None,
        "kt_min": min(kts) if kts else None,
        "kt_max": max(kts) if kts else None,
        "npts": len(keep),
        "nexcluded": len(excluded),
        "final_levels": levels[:200],
        "level_heading": lvl_name,
        "err_components": components,
        "d_tot_source": d_tot_src,
        "err_columns": err_where,
        "monitor": monitor,
        "flags": sorted(flags),
        "corrections": corrected,
        "analysis": analysis,
        "threshold_cm": _round(threshold, 6) if threshold else 0.0,
        "measured_min_cm": {f"{k}sigma": _round(v, 6) for k, v in zip(measured.SIGMAS, m_low)},
        "flag_texts": {f"{k:g}": v for k, v in flag_text.items()},
        "status": own_status,
        "superseded_by": superseded_by,
        "history": history,
        "entry_history": entry_history,
        "entry_status": entry_status,
        "year": year,
        "authors": authors,
        "first_author": _surname(authors[0]) if authors else "",
        "institutes": [{"code": c, "name": dictionary.institute(c)} for c in inst_codes],
        "facility": fac,
        "methods": methods,
        "detectors": detectors,
        "refs": refs,
        "doi": next((r["doi"] for r in refs if r.get("doi")), None),
        "title": title[:400],
        "subentry_date": _iso(sub.date),
        "entry_date": _iso(entry.date),
        "entry_updated": update[0] if update else None,
        "entry_revisions": update[1] if update else None,
    }
    return Dataset(meta, points, ex_rows)


def _iso(d: str) -> Optional[str]:
    d = (d or "").strip()
    if len(d) == 8 and d.isdigit():
        return f"{d[:4]}-{d[4:6]}-{d[6:8]}"
    if len(d) == 6 and d.isdigit():
        return ("19" if int(d[:2]) > 60 else "20") + f"{d[:2]}-{d[2:4]}-{d[4:6]}"
    return d or None


def datasets(entry: Entry, update: Optional[Tuple[str, int]] = None):
    """Every dataset of an entry (subentry 001 holds no data)."""
    first = entry.first
    entry_history = _history(first.items("HISTORY")) if first else []
    for sub in entry.subentries:
        if sub.number == "001":
            continue
        items = sub.items("REACTION") or (first.items("REACTION") if first else [])
        for item in items:
            ds = build(entry, sub, item, update, entry_history)
            if ds is not None:
                yield ds

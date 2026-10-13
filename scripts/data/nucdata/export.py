"""Exports of a selection of datasets: AZURE2 data files, CSV, JSON, BibTeX.

    python scripts/data/dx.py export O1195.002,O1709.002.1 --format azure2 --out DIR
        [--lab-particle projectile|target] [--masses ame|integer] [--data public/data]

AZURE2 (the commit pinned in deploy/Dockerfile.azure2) reads a data file as
whitespace-separated rows of exactly four numbers (DataLine.h) and allows no
comment lines, so each exported dataset is written as

  <stem>.dat   E_lab [MeV]  angle [deg]  value [b or b/sr]  uncertainty  -- AZURE2 reads this
  <stem>.csv   every column, with a '#' header: EXFOR id, revision dates,
               reaction code, quantity, frames, normalisation/monitor,
               systematic uncertainty, flags, citation/DOI, licence
  segments.txt one stub <segmentsData> line per .dat file, in the order of
               README.txt, which says what to edit (the pair keys)

Column conventions of the .dat file:
  1. E_lab: the laboratory energy of the particle AZURE2's entrance pair
     treats as the projectile -- the EXFOR projectile by default, or the
     EXFOR target (`--lab-particle target`, e.g. 3He+4He with 3He moving).
     AZURE2 converts it to c.m. with E_cm = E_lab M2/(M1+M2), non-
     relativistically; the export inverts exactly that, with AME2020 masses
     (`--masses ame`) or mass numbers (`--masses integer`), to match the
     pair masses of the .azr file.
  2. angle: 0 for angle-integrated data; for dσ/dΩ, the angle in the frame
     EXFOR gives it (segment type isDiff 1 for lab, 4 for c.m.).
  3. value: σ in b (angle-integrated, isDiff 0) or dσ/dΩ in b/sr.  An EXFOR
     S-factor is converted to σ = S/E_cm exp(-2πη) (AZURE2 reads cross
     sections only); the header says so and the CSV keeps S.
  4. uncertainty: the point-to-point uncertainty: statistical (+) point-wise
     systematic components in quadrature; where EXFOR gives only a total
     (ERR-T, DATA-ERR) that total is used and the header says so.  Common
     (normalisation) systematic components go into the segment's
     normalisation uncertainty (%), column 11 of the stub line.

One file per final level (E-LVL/E-EXC) when a dataset holds several.
"""

import csv
import io
import json
import math
import os
import re
from typing import Dict, List, Optional

from . import config, dictionary, masses
from .dataset import nuclide, particle
from .store import find

AZURE2_TYPES = {"sigma": 0, "S": 0, "dsigma": None, "pol": 7}


def _masses(meta: dict, model: str):
    """(m_projectile, m_target) in u for the export's lab<->c.m. relation."""
    p = meta["sf"][0]
    t = nuclide(p[0])
    pr = particle(p[1])
    if not t or not pr:
        return None, None
    At, Zt = t[1], t[0]
    Ap, Zp = pr
    if model == "integer" or At == 0:
        return float(Ap), float(At or masses.STD_WEIGHT[Zt])
    return masses.atomic_mass_u(Ap, Zp), masses.atomic_mass_u(At, Zt)


def _charges(meta):
    p = meta["sf"][0]
    t = nuclide(p[0])
    pr = particle(p[1])
    return (pr[1] if pr else 0), (t[0] if t else 0)


def point_columns(meta: dict, pts: dict) -> Dict[str, List[Optional[float]]]:
    """Every point-wise error column by its EXFOR heading (ERR-S, ERR-T, ...),
    whether stored under `err` or as d_stat/d_sys/d_tot."""
    out = dict(pts.get("err") or {})
    for name, where in (meta.get("err_columns") or {}).items():
        if where != "err" and pts.get(where) is not None:
            out[name] = pts[where]
    return out


def point_error(meta: dict, pts: dict, mode: str = "point") -> (List[Optional[float]], str):
    """The uncertainty for AZURE2 column 4, row by row, and what it is.

    point: statistical (+) point-wise systematic components in quadrature,
           the EXFOR total for a row that has neither (default);
    stat:  statistical only, the total for a row without it;
    total: the EXFOR total (ERR-T, DATA-ERR), else the components.
    Common (normalisation) components are never included: they belong to the
    segment's normalisation uncertainty."""
    comps = {c["name"]: c for c in meta["err_components"]}
    n = len(pts["value"])
    err = point_columns(meta, pts)
    base = lambda k: k.split("#")[0]
    stat = [k for k, c in comps.items() if c["where"] == "point" and c["kind"] == "stat" and k in err]
    sys_ = [k for k, c in comps.items() if c["where"] == "point" and c["kind"] == "sys" and k in err]
    if any(base(k) == "ERR-SYS" for k in sys_):
        sys_ = [k for k in sys_ if base(k) == "ERR-SYS"]
    total = [k for k, c in comps.items() if c["where"] == "point" and c["kind"] == "total" and k in err]
    total.sort(key=lambda k: base(k) != "ERR-T")
    first = {"point": [stat + sys_, total], "stat": [stat, total], "total": [total, stat + sys_]}[mode]
    out, used = [], set()
    for i in range(n):
        val = None
        for names in first:
            parts = [err[k][i] for k in names if err[k][i] is not None]
            if parts:
                if names is total:
                    parts = parts[:1]
                val = math.sqrt(sum(x * x for x in parts))
                used.update(k for k in names if err[k][i] is not None)
                break
        out.append(val)
    what = (f"{mode}: " + ", ".join(sorted(used))) if used else "none given"
    return out, what


def normalisation_percent(meta: dict) -> (float, str):
    """Common systematic components (in %) combined in quadrature."""
    parts, names = [], []
    comps = [c for c in meta["err_components"] if c["where"] == "common" and c["kind"] in ("sys", "total")]
    if any(c["name"] == "ERR-SYS" for c in comps):
        comps = [c for c in comps if c["name"] == "ERR-SYS"]
    for c in comps:
        if c.get("relative") and c.get("value") is not None:
            parts.append(c["value"])
            names.append(f"{c['name']} {c['value']:g} %")
    return (math.sqrt(sum(x * x for x in parts)) if parts else 0.0), ", ".join(names)


# Relative margin of a segment's energy limits beyond the energies written.
SEGMENT_MARGIN = 1e-5


def _fmt(v: Optional[float]) -> str:
    return "" if v is None else f"{v:.6e}"


def header(meta: dict, extra: List[str], snapshot: dict) -> List[str]:
    refs = "; ".join(r["code"] + (f" doi:{r['doi']}" if r.get("doi") else "") for r in meta["refs"])
    norm, norm_names = normalisation_percent(meta)
    mon = "; ".join(m["code"] + (f" ({m['text']})" if m["text"] else "") for m in meta["monitor"]) or "none"
    comps = "; ".join(f"{c['name']} [{c['kind']}, {c['where']}"
                      + (f", {c['value']:g} {c['unit']}" if c.get("value") is not None else "")
                      + "]" + (f" {c['text']}" if c.get("text") else "") for c in meta["err_components"])
    lines = [
        f"EXFOR dataset: {meta['id']} (entry {meta['entry']}, subentry {meta['subentry']}"
        + (f", pointer {meta['pointer']})" if meta["pointer"] else ")"),
        f"EXFOR: {meta['links']['exfor']}",
        f"Master file: {meta['links']['master']}",
        f"Revision: entry {meta['entry_updated'] or meta['entry_date']} ({meta['entry_revisions']} revisions), "
        f"subentry {meta['subentry_date']}",
        f"Reaction code: ({meta['code']})",
        f"Quantity: {meta['quantity_class']} ({meta['quantity_text'] or meta['quantity']}), unit {meta['value_unit']}",
        f"Frame: energy given as {meta['E_source']} ({meta['E_frame']}); angle {meta['ang_frame'] or 'n/a'}; "
        f"value {meta['value_frame'] or 'n/a'}",
        f"Final levels (MeV): {', '.join(f'{x:g}' for x in meta['final_levels']) or 'not specified'}",
        f"Normalisation/monitor: {mon}",
        f"Systematic (common) uncertainty: {norm:.3g} % ({norm_names or 'none given'})",
        f"Uncertainty components: {comps or 'none'}",
        f"Flags: {', '.join(meta['flags']) or 'none'}",
        *[f"Corrected here: {c['change']} ({c['problem']} scripts/data/corrections.yaml)"
          for c in meta.get("corrections") or []],
        f"Excluded rows: {meta['nexcluded']}",
        f"Authors: {', '.join(meta['authors'])}",
        f"Title: {meta['title']}",
        f"Reference: {refs}",
        f"Data: EXFOR (IAEA/NRDC), snapshot {snapshot['date']} (exfor_master {snapshot['commit'][:10]}), "
        "CC BY 4.0. Cite the original paper and N. Otuka et al., Nucl. Data Sheets 120, 272 (2014).",
    ]
    return lines + extra


def azure2(ds: dict, snapshot: dict, lab_particle: str = "projectile", mass_model: str = "ame",
           error: str = "point") -> List[dict]:
    meta, pts = ds["meta"], ds["points"]
    q = meta["quantity_class"]
    if q not in ("sigma", "S", "dsigma", "pol") or meta["complex"]:
        return [{"skip": f"{meta['id']}: quantity '{q}' has no AZURE2 data segment; use CSV/JSON"}]
    if q == "pol" and "ANA" not in meta["quantity"]:
        return [{"skip": f"{meta['id']}: only analysing powers (ANA) map to an AZURE2 segment (isDiff 7)"}]
    mp, mt = _masses(meta, mass_model)
    if mp is None or not mp:
        return [{"skip": f"{meta['id']}: no masses for this reaction"}]
    if lab_particle == "target":
        m1, m2 = mt, mp       # the EXFOR target is AZURE2's moving particle
    else:
        m1, m2 = mp, mt
    n = len(pts["value"])
    ecm = pts["E_cm"]
    e_lab = [None if e is None else e * (m1 + m2) / m2 for e in ecm]
    ang = pts.get("ang") or [None] * n
    lvl = pts.get("E_level") or [None] * n
    err, err_what = point_error(meta, pts, error)
    norm, norm_names = normalisation_percent(meta)
    value = list(pts["value"])
    conv_note = []
    factor = [1.0] * n
    if q == "S":
        z1, z2 = _charges(meta)
        ap, at = _masses(meta, "ame")         # eta from the physical masses, whatever E_lab uses
        mu = ap * at / (ap + at) * masses.AMU
        for i in range(n):
            e = ecm[i]
            factor[i] = None if not e or e <= 0 else math.exp(-masses.two_pi_eta(z1, z2, mu, e)) / e
        conv_note.append("value: EXFOR gives the S-factor (MeV b); converted for AZURE2 to "
                         "sigma = S/E_cm exp(-2 pi eta), eta from E_cm and the AME2020 reduced mass; "
                         "the CSV keeps S")
    if q == "dsigma" or q == "pol":
        is_diff = 4 if (meta["ang_frame"] == "cm" or q == "pol") else 1
        if q == "pol":
            is_diff = 7
            if meta["ang_frame"] != "cm":
                conv_note.append("WARNING: AZURE2 isDiff 7 expects c.m. angles; EXFOR gives lab angles")
        if meta["value_frame"] == "cm" and is_diff == 1:
            conv_note.append("WARNING: value in c.m. with lab angles")
    else:
        is_diff = 0
    groups: Dict[Optional[float], List[int]] = {}
    for i in range(n):
        if value[i] is None or e_lab[i] is None:
            continue
        if pts.get("limit") and pts["limit"][i]:
            continue    # limits are not data points for a fit
        key = lvl[i] if len(meta["final_levels"]) > 1 else None
        groups.setdefault(key, []).append(i)
    if not groups:
        return [{"skip": f"{meta['id']}: no exportable points"}]
    author = re.sub(r"[^A-Za-z]", "", meta["first_author"]) or "EXFOR"
    base = f"{author}-{meta['entry']}{meta['subentry']}" + (f"-p{meta['pointer']}" if meta["pointer"] else "")
    out = []
    for lv, rows in sorted(groups.items(), key=lambda kv: (kv[0] is None, kv[0] or 0)):
        stem = base + (f"-{round(lv * 1000):d}" if lv is not None else "")
        dat, table, written, no_err = [], [], [], 0
        for i in rows:
            f = factor[i]
            if f is None:
                continue
            v = value[i] * f
            d = None if err[i] is None else err[i] * f
            if d is not None and d > 0:
                # AZURE2 gives a point of uncertainty 0 no weight in chi2: such rows
                # stay in the CSV only.
                dat.append(f"{e_lab[i]:.6e} {(ang[i] or 0.0) if is_diff else 0:.4f} {v:.6e} {d:.6e}")
                written.append(i)
            else:
                no_err += 1
            table.append([_fmt(e_lab[i]), _fmt(ecm[i]), _fmt(pts["E_lab"][i]), "" if ang[i] is None else f"{ang[i]:g}",
                          _fmt(pts["value"][i]), _fmt(v) if q == "S" else "",
                          _fmt((pts.get("d_stat") or [None] * n)[i]), _fmt((pts.get("d_sys") or [None] * n)[i]),
                          _fmt((pts.get("d_tot") or [None] * n)[i]), _fmt(d) if d else "",
                          "" if lvl[i] is None else f"{lvl[i]:g}",
                          "" if not pts.get("flag") or pts["flag"][i] is None else f"{pts['flag'][i]:g}"])
        if not written:
            out.append({"skip": f"{meta['id']}"
                        + (f" (E_x = {lv:g} MeV)" if lv is not None else "")
                        + ": no point has an uncertainty, and AZURE2 would give them no weight; use the CSV/JSON"})
            continue
        # The segment's limits bracket the energies (and angles) as the .dat file
        # writes them: AZURE2 keeps a point only if E_min <= E <= E_max.
        es = [float(f"{e_lab[i]:.6e}") for i in written]
        e_lo, e_hi = min(es) * (1 - SEGMENT_MARGIN), max(es) * (1 + SEGMENT_MARGIN)
        angs = [float(f"{ang[i]:.4f}") for i in written if ang[i] is not None]
        if is_diff and angs:
            a_lo, a_hi = f"{max(0.0, min(angs) - 0.001):.4f}", f"{min(180.0, max(angs) + 0.001):.4f}"
        else:
            a_lo, a_hi = "0", "180"
        vary = 1 if norm > 0 else 0
        exit_key = "-1" if (q in ("sigma", "S") and lv is None and "PAR" not in meta["quantity"]
                            and meta["process"] == "g") else "EXIT"
        seg = (f"1 ENTR {exit_key} {e_lo:.6e} {e_hi:.6e} {a_lo} {a_hi} "
               f"{3 if exit_key == '-1' else is_diff} 1 {vary} {norm:.3g} 0 0 0 data/{stem}.dat 0 0")
        extra = [
            f"AZURE2 file: data/{stem}.dat (columns E_lab MeV, angle deg, value, uncertainty; no header)",
            f"AZURE2 E_lab: lab energy of the {'EXFOR target' if lab_particle == 'target' else 'EXFOR projectile'} "
            f"(m1 = {m1:.6f} u moving on m2 = {m2:.6f} u, {mass_model} masses), E_lab = E_cm (m1+m2)/m2",
            f"AZURE2 value unit: {'b/sr' if is_diff in (1, 4) else ('' if is_diff == 7 else 'b')}; "
            f"segment type isDiff {3 if exit_key == '-1' else is_diff}",
            f"AZURE2 uncertainty (column 4): {err_what}",
            f"AZURE2 normalisation uncertainty (segment column 11): {norm:.3g} %",
            (f"AZURE2 normalisation: varied (segment column 10 = 1) within the {norm:.3g} % above" if vary else
             "AZURE2 normalisation: fixed at 1 (segment column 10 = 0): EXFOR gives no common systematic "
             "uncertainty, and a varied normalisation without one would float freely; set it yourself"),
        ] + ([f"AZURE2 rows left out of the .dat: {no_err} without an uncertainty (AZURE2 would give them "
              "no weight in chi2); they are below with an empty d_azure2"] if no_err else []) \
          + [f"Note: {c}" for c in conv_note]
        if lv is not None:
            extra.append(f"This file: final level E_x = {lv:g} MeV")
        cols = ["E_lab_azure2_MeV", "E_cm_MeV", "E_lab_projectile_MeV", "angle_deg", f"value_{meta['value_unit'] or 'nodim'}",
                "value_azure2", "d_stat", "d_sys", "d_tot", "d_azure2", "E_level_MeV", "flag"]
        buf = io.StringIO()
        for h in header(meta, extra, snapshot):
            buf.write("# " + h + "\n")
        w = csv.writer(buf, lineterminator="\n")
        w.writerow(cols)
        w.writerows(table)
        out.append({"stem": stem, "dat": "\n".join(dat) + "\n", "csv": buf.getvalue(), "segment": seg,
                    "id": meta["id"], "level": lv, "is_diff": is_diff, "no_err": no_err, "vary": vary})
    return out


def csv_long(datasets: List[dict]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["id", "reaction", "quantity", "E_frame_given", "E_lab_MeV", "E_cm_MeV", "angle_deg", "angle_frame",
                "E_level_MeV", "value", "unit", "limit", "d_stat", "d_sys", "d_tot", "flag", "doi"])
    for ds in datasets:
        m, p = ds["meta"], ds["points"]
        n = len(p["value"])
        col = lambda k: p.get(k) or [None] * n
        for i in range(n):
            w.writerow([m["id"], m["reaction"], m["quantity_class"], m["E_frame"], _fmt(col("E_lab")[i]),
                        _fmt(col("E_cm")[i]), col("ang")[i] if col("ang")[i] is not None else "", m["ang_frame"] or "",
                        col("E_level")[i] if col("E_level")[i] is not None else "", _fmt(col("value")[i]),
                        m["value_unit"], col("limit")[i] or "", _fmt(col("d_stat")[i]), _fmt(col("d_sys")[i]),
                        _fmt(col("d_tot")[i]), "" if col("flag")[i] is None else f"{col('flag')[i]:g}",
                        m["doi"] or ""])
    return buf.getvalue()


def _bib_escape(s: str) -> str:
    """Braces, `&` and backslashes, in one pass (a backslash becomes \\textbackslash{})."""
    return re.sub(r"[\\{}&]", lambda m: "\\textbackslash{}" if m.group(0) == "\\" else "\\" + m.group(0), s)


_SUP = dict(zip("⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻", "0123456789+-"))
_SUB = dict(zip("₀₁₂₃₄₅₆₇₈₉ₚₙₐₑₓ", "0123456789pnaex"))
_GREEK = {
    "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon", "ζ": "zeta", "η": "eta", "θ": "theta",
    "ι": "iota", "κ": "kappa", "λ": "lambda", "μ": "mu", "µ": "mu", "ν": "nu", "ξ": "xi", "π": "pi", "ρ": "rho",
    "σ": "sigma", "τ": "tau", "υ": "upsilon", "φ": "phi", "χ": "chi", "ψ": "psi", "ω": "omega", "Γ": "Gamma",
    "Δ": "Delta", "Θ": "Theta", "Λ": "Lambda", "Ξ": "Xi", "Π": "Pi", "Σ": "Sigma", "Φ": "Phi", "Ψ": "Psi",
    "Ω": "Omega",
}


def _bib_title(s: str) -> str:
    """Superscripts, subscripts and Greek letters as LaTeX math: ¹⁴N(p,γ)¹⁵O → $^{14}$N(p,$\\gamma$)$^{15}$O
    (lib/data/export.ts bibTitle). Applied after _bib_escape."""
    def math(body):
        return "\x01" + body + "\x02"
    s = re.sub("[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+", lambda m: math("^{" + "".join(_SUP[c] for c in m.group(0)) + "}"), s)
    s = re.sub("[₀₁₂₃₄₅₆₇₈₉ₚₙₐₑₓ]+", lambda m: math("_{" + "".join(_SUB[c] for c in m.group(0)) + "}"), s)
    s = re.sub("[α-ωΓΔΘΛΞΠΣΦΨΩµ]", lambda m: math("\\" + _GREEK[m.group(0)]) if m.group(0) in _GREEK else m.group(0), s)
    s = s.replace("→", math("\\rightarrow"))
    return s.replace("\x02\x01", "").replace("\x01", "$").replace("\x02", "$")


def bibtex(datasets: List[dict]) -> str:
    """One entry per (EXFOR entry, first reference), the dataset ids in `note`."""
    seen: Dict[str, dict] = {}
    for ds in datasets:
        m = ds["meta"]
        key = m["entry"]
        if key in seen:
            seen[key]["ids"].append(m["id"])
            continue
        seen[key] = {"meta": m, "ids": [m["id"]]}
    out = []
    journals = dictionary.load()["journals"]
    for key, v in seen.items():
        m = v["meta"]
        ref = m["refs"][0] if m["refs"] else {"code": "", "type": ""}
        parts = [x.strip() for x in ref["code"].split(",")]
        authors = " and ".join(a for a in m["authors"])
        fields = {"author": authors, "title": m["title"], "year": str(m["year"] or "")}
        kind = "misc"
        if ref.get("type") == "J" and len(parts) >= 5:
            kind = "article"
            fields["journal"] = journals.get(parts[1], parts[1])
            fields["volume"] = parts[2]
            rest = [x for x in parts[3:-1] if not x.startswith("(")]
            if rest:
                fields["pages"] = rest[0]
        else:
            fields["howpublished"] = ref.get("code", "")
        if m["doi"]:
            fields["doi"] = m["doi"]
        fields["note"] = f"EXFOR {', '.join(v['ids'])} ({m['links']['exfor']})"
        cite = re.sub(r"[^A-Za-z]", "", m["first_author"]) + str(m["year"] or "") + "_" + key
        body = ",\n".join(
            f"  {k} = {{{_bib_title(_bib_escape(str(x))) if k == 'title' else _bib_escape(str(x))}}}"
            for k, x in fields.items() if x)
        out.append(f"@{kind}{{{cite},\n{body}\n}}")
    return "\n\n".join(out) + "\n"


def write_azure2(datasets: List[dict], out_dir: str, snapshot: dict, **kw) -> List[dict]:
    os.makedirs(os.path.join(out_dir, "data"), exist_ok=True)
    files, segs, readme = [], [], []
    for ds in datasets:
        for f in azure2(ds, snapshot, **kw):
            if "skip" in f:
                readme.append("skipped: " + f["skip"])
                continue
            with open(os.path.join(out_dir, "data", f["stem"] + ".dat"), "w") as fh:
                fh.write(f["dat"])
            with open(os.path.join(out_dir, "data", f["stem"] + ".csv"), "w") as fh:
                fh.write(f["csv"])
            segs.append(f["segment"])
            readme.append(f"segment {len(segs)}: data/{f['stem']}.dat  ({f['id']}"
                          + (f", E_x = {f['level']:g} MeV" if f["level"] is not None else "") + ")"
                          + ("" if f["vary"] else "  normalisation fixed")
                          + (f"  {f['no_err']} rows without uncertainty left out" if f["no_err"] else ""))
            files.append(f)
    with open(os.path.join(out_dir, "segments.txt"), "w") as fh:
        fh.write("\n".join(segs) + "\n")
    with open(os.path.join(out_dir, "README.txt"), "w") as fh:
        fh.write("Stub <segmentsData> lines for AZURE2 (segments.txt). Replace ENTR and EXIT with the\n"
                 "entrance and exit pair keys of your .azr file (EXIT -1 marks a total-capture segment\n"
                 "already), check the energy and angle ranges, and paste the lines between\n"
                 "<segmentsData> and </segmentsData>. Columns: active, entrance, exit, E_min, E_max\n"
                 "(lab, as in the file), angle min, max, data type (0 angle-integrated, 1 dσ/dΩ lab,\n"
                 "3 total capture, 4 dσ/dΩ c.m., 7 analysing power), norm, vary norm,\n"
                 "normalisation uncertainty (%), energy shift, its uncertainty, vary shift, file, 0 0.\n"
                 "Every data file has a .csv beside it with all columns and the EXFOR header.\n"
                 "E_min and E_max bracket the file's energies by a relative 1e-5 (and the angles by\n"
                 "0.001 deg), so AZURE2 keeps every point. The normalisation varies only where EXFOR\n"
                 "gives a common systematic uncertainty; without one it is fixed at 1 (vary 0).\n"
                 "Rows without an uncertainty are left out of the .dat files (AZURE2 gives them no\n"
                 "weight) and kept in the .csv files; a file with none is skipped.\n\n"
                 + "\n".join(readme) + "\n")
    return files


def run(argv=None):
    import argparse
    ap = argparse.ArgumentParser(prog="dx.py export")
    ap.add_argument("ids", help="comma-separated dataset ids (O1195.002,O1709.002.1)")
    ap.add_argument("--format", choices=["azure2", "csv", "json", "bibtex"], default="azure2")
    ap.add_argument("--out", required=True)
    ap.add_argument("--data", default=config.OUT_DIR)
    ap.add_argument("--lab-particle", choices=["projectile", "target"], default="projectile")
    ap.add_argument("--masses", choices=["ame", "integer"], default="ame")
    ap.add_argument("--error", choices=["point", "stat", "total"], default="point",
                    help="AZURE2 column 4 (see point_error)")
    args = ap.parse_args(argv)
    sets = []
    for i in args.ids.split(","):
        ds = find(args.data, i.strip())
        if ds is None:
            raise SystemExit(f"{i}: not in the index")
        sets.append(ds)
    with open(os.path.join(args.data, "meta.json")) as f:
        ex = json.load(f)["exfor"]
    snapshot = {"date": ex["snapshot_date"], "commit": ex["commit"]}
    os.makedirs(args.out, exist_ok=True)
    if args.format == "azure2":
        files = write_azure2(sets, args.out, snapshot, lab_particle=args.lab_particle, mass_model=args.masses,
                             error=args.error)
        print(f"{len(files)} AZURE2 files in {args.out}")
    elif args.format == "csv":
        with open(os.path.join(args.out, "datasets.csv"), "w") as f:
            f.write(csv_long(sets))
    elif args.format == "json":
        with open(os.path.join(args.out, "datasets.json"), "w") as f:
            json.dump({"schema": "dx-export", "snapshot": snapshot, "datasets": sets}, f, ensure_ascii=False)
    else:
        with open(os.path.join(args.out, "datasets.bib"), "w") as f:
            f.write(bibtex(sets))

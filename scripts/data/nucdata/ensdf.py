"""A reader for ENSDF files in the NNDC 80-column format (ENSDF manual,
"Evaluated Nuclear Structure Data File: A Manual for Preparation of Data
Sets", J. K. Tuli, BNL-NCS-51655, and its later revisions).

Records used (column numbers are 1-based, as in the manual):

  ID          1-5 NUCID, 10-39 DSID, 40-65 DSREF, 66-74 PUB, 75-80 DATE
  H history   8 'H', 10-80 'TYP=FUL$AUT=...$CIT=...$CUT=...$'
  Q           10-19 Q-  20-21 DQ-  22-29 SN 30-31 DSN 32-39 SP 40-41 DSP
              42-49 QA 50-55 DQA 56-80 QREF
  L level     10-19 E 20-21 DE 22-39 J 40-49 T 50-55 DT 56-64 L 65-74 S
              75-76 DS 77 C 78-79 MS 80 Q
  G gamma     10-19 E 20-21 DE 22-29 RI 30-31 DRI 32-41 M 42-49 MR
              50-55 DMR 56-62 CC 63-64 DCC 65-74 TI 75-76 DTI 77 C 78 COIN
              80 Q
  continuation records: column 6 non-blank, 'NAME=value unc$' fields
  comments: column 7 'C', 'D', 'T' (either case) -- skipped

Uncertainties are given in units of the last digit of the value
("6793.1 17" = 6793.1 +- 1.7); "LT", "GT", "AP", "CA", "SY", "+a-b" are kept
as text.  Each data set ends with a blank record.
"""

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

_NUM = re.compile(r"^[-+]?(\d+\.?\d*|\.\d+)([Ee][-+]?\d+)?$")
T_UNITS = {"Y": 3.15576e7, "D": 86400.0, "H": 3600.0, "M": 60.0, "S": 1.0, "MS": 1e-3,
           "US": 1e-6, "NS": 1e-9, "PS": 1e-12, "FS": 1e-15, "AS": 1e-18}
W_UNITS = {"MEV": 1e6, "KEV": 1e3, "EV": 1.0, "MILLIEV": 1e-3, "MEV ": 1e6, "UEV": 1e-6}
HBAR_EVS = 6.582119569e-16      # eV s


def value_unc(v: str, dv: str) -> Tuple[Optional[float], Optional[float], str]:
    """('6793.1', '17') -> (6793.1, 1.7, ''); non-numeric uncertainties are
    returned as the third element ('LT', 'AP', '+3-2', ...)."""
    v, dv = v.strip(), dv.strip()
    if not v or not _NUM.match(v):
        return None, None, dv
    x = float(v)
    if not dv:
        return x, None, ""
    if dv.isdigit():
        mant, _, exp = v.upper().partition("E")
        dec = len(mant.split(".")[1]) if "." in mant else 0
        unc = int(dv) * 10 ** (-dec)
        if exp:
            unc *= 10 ** int(exp)
        return x, float(f"{unc:.6g}"), ""
    m = re.match(r"^\+(\d+)-(\d+)$", dv)
    if m:
        mant = v.upper().split("E")[0]
        dec = len(mant.split(".")[1]) if "." in mant else 0
        return x, None, f"+{int(m.group(1)) * 10 ** -dec:g}-{int(m.group(2)) * 10 ** -dec:g}"
    return x, None, dv


@dataclass
class Record:
    kind: str       # 'ID', 'H', 'Q', 'L', 'G', 'N', 'P', ...
    line: str
    cont: List[str] = field(default_factory=list)   # continuation texts (cols 10-80)

    def col(self, a: int, b: int) -> str:
        return self.line[a - 1:b].strip() if len(self.line) >= a else ""


@dataclass
class DataSet:
    nucid: str
    dsid: str
    dsref: str
    pub: str
    date: str
    records: List[Record]


def _is_comment(line: str) -> bool:
    return len(line) > 6 and line[6] in "CDTcdt"


def parse(text: str) -> List[DataSet]:
    """Every data set of an ENSDF file (an archive file, or a per-nuclide one)."""
    out: List[DataSet] = []
    cur: Optional[DataSet] = None
    for raw in text.replace("\r", "").split("\n"):
        line = raw.rstrip("\n").ljust(80)[:80]
        if not line.strip():
            if cur:
                out.append(cur)
            cur = None
            continue
        if cur is None:
            cur = DataSet(nucid=line[0:5].strip(), dsid=line[9:39].strip(), dsref=line[39:65].strip(),
                          pub=line[65:74].strip(), date=line[74:80].strip(), records=[])
            continue
        if _is_comment(line):
            continue
        rtype = line[7]
        if line[5] not in " 1" and cur.records:
            # Continuation of the last record of the same type.
            for r in reversed(cur.records):
                if r.kind == rtype:
                    r.cont.append(line[9:80])
                    break
            continue
        cur.records.append(Record(rtype if rtype != " " else "?", line))
    if cur:
        out.append(cur)
    return out


def _cont_fields(cont: List[str]) -> Dict[str, str]:
    """'%EC+%B+=100$ MOMM1=0.7189 8 (1989Ra17)$ ISPIN=1/2' -> dict."""
    out = {}
    for part in "$".join(cont).split("$"):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"^([A-Z%0-9+\-()]+?)\s*(=|<|>|AP|LT|GT|LE|GE|~)\s*(.*)$", part)
        if m:
            out[m.group(1)] = (m.group(2) if m.group(2) != "=" else "") + m.group(3).strip()
    return out


def _halflife(t: str, dt: str) -> dict:
    """The T field: a half-life (with unit), a width (eV..MeV) or STABLE."""
    t = t.strip()
    if not t:
        return {}
    if t.upper().startswith("STABLE"):
        return {"stable": True}
    m = re.match(r"^([<>~]?)\s*([-+]?[\d.]+(?:E[-+]?\d+)?)\s*([A-Z]+)\s*(.*)$", t.upper())
    if not m:
        return {"text": t}
    rel, v, unit, rest = m.groups()
    val, unc, utext = value_unc(v, dt)
    out = {"text": (t + " " + dt).strip()}
    if val is None:
        return out
    if rel:
        utext = {"<": "LT", ">": "GT", "~": "AP"}[rel]
    if unit in T_UNITS:
        out["t_half_s"] = _sig(val * T_UNITS[unit])
        if unc is not None:
            out["dt_half_s"] = _sig(unc * T_UNITS[unit])
    elif unit in ("EV", "KEV", "MEV", "MILLIEV", "UEV"):
        f = {"EV": 1.0, "KEV": 1e3, "MEV": 1e6, "MILLIEV": 1e-3, "UEV": 1e-6}[unit]
        out["width_eV"] = _sig(val * f)
        if unc is not None:
            out["dwidth_eV"] = _sig(unc * f)
    if utext.startswith("+"):
        out["d_asym"] = utext          # +upper-lower, in the field's unit (see text)
    elif utext:
        out["limit"] = utext           # LT, GT, AP, CA, SY, ...
    return out


def _jpi(j: str) -> dict:
    j = j.strip()
    if not j:
        return {}
    iso = None
    m = re.search(r",?\s*T=([\d/]+)", j)
    if m:
        iso = m.group(1)
        j = (j[:m.start()] + j[m.end():]).strip(", ")
    firm = not re.search(r"[()]", j) and "," not in j and "&" not in j and " TO " not in j.upper()
    out = {"J": j, "firm": firm}
    if iso:
        out["T"] = iso
    return out


def _history(records: List[Record]) -> List[dict]:
    hist = []
    for r in records:
        if r.kind != "H":
            continue
        text = "$".join([r.line[9:80]] + r.cont)
        fields = {}
        for part in text.split("$"):
            if "=" in part:
                k, _, v = part.partition("=")
                fields[k.strip()] = v.strip()
        if fields:
            hist.append(fields)
    return hist


def adopted(datasets: List[DataSet]) -> Optional[DataSet]:
    for ds in datasets:
        if ds.dsid.startswith("ADOPTED LEVELS"):
            return ds
    return None


def _sig(x: Optional[float], n: int = 6) -> Optional[float]:
    return None if x is None else float(f"{x:.{n}g}")


def summary(ds: DataSet) -> dict:
    """Levels, gammas and evaluation of an ADOPTED LEVELS(, GAMMAS) data set."""
    m = re.match(r"^(\d+)", ds.nucid)
    mass_keV = int(m.group(1)) * 931494.1 if m else None
    levels: List[dict] = []
    unplaced: List[dict] = []
    q = None
    for r in ds.records:
        if r.kind == "Q" and q is None:
            qm, dqm, qt = value_unc(r.col(10, 19), r.col(20, 21))
            sn, dsn, snt = value_unc(r.col(22, 29), r.col(30, 31))
            sp, dsp, spt = value_unc(r.col(32, 39), r.col(40, 41))
            qa, dqa, qat = value_unc(r.col(42, 49), r.col(50, 55))
            q = {"Q_minus_keV": qm, "dQ_minus_keV": dqm, "S_n_keV": sn, "dS_n_keV": dsn,
                 "S_p_keV": sp, "dS_p_keV": dsp, "Q_alpha_keV": qa, "dQ_alpha_keV": dqa,
                 "ref": r.col(56, 80)}
        elif r.kind == "L":
            e_txt = r.col(10, 19)
            e, de, de_txt = value_unc(e_txt, r.col(20, 21))
            lev = {"E_keV": e}
            if e is None:
                lev["E_text"] = e_txt
                m = re.match(r"^([\d.]+)\s*\+\s*([A-Z]+)$", e_txt)
                if m:
                    lev["E_keV_offset"] = [float(m.group(1)), m.group(2)]
            if de is not None:
                lev["dE_keV"] = de
            if de_txt:
                lev["dE_text"] = de_txt
            lev.update(_jpi(r.col(22, 39)))
            lev.update(_halflife(r.col(40, 49), r.col(50, 55)))
            cf = _cont_fields(r.cont)
            if "ISPIN" in cf and "T" not in lev:
                lev["T"] = cf["ISPIN"].split()[0]
            decay = {k: v for k, v in cf.items() if k.startswith("%")}
            if decay:
                lev["decay"] = decay
            widths = {k: v for k, v in cf.items() if k.startswith("WIDTH")}
            if widths:
                lev["widths"] = widths
            if r.col(56, 64):
                lev["L"] = r.col(56, 64)
            if r.col(80, 80) == "?":
                lev["questionable"] = True
            if r.col(80, 80) == "S":
                lev["predicted"] = True
            if r.col(78, 79):
                lev["isomer"] = r.col(78, 79)
            lev["gammas"] = []
            levels.append(lev)
        elif r.kind == "G":
            eg, deg, _ = value_unc(r.col(10, 19), r.col(20, 21))
            ri, dri, ri_txt = value_unc(r.col(22, 29), r.col(30, 31))
            mr, dmr, mr_txt = value_unc(r.col(42, 49), r.col(50, 55))
            g = {"E_keV": eg}
            if deg is not None:
                g["dE_keV"] = deg
            if ri is not None:
                g["I"] = ri
                if dri is not None:
                    g["dI"] = dri
                if ri_txt:
                    g["I_limit"] = ri_txt
            if r.col(32, 41):
                g["M"] = r.col(32, 41)
            if mr is not None:
                g["delta"] = mr
                if dmr is not None:
                    g["d_delta"] = dmr
                if mr_txt:
                    g["delta_text"] = mr_txt
            cf = _cont_fields(r.cont)
            red = {k: v for k, v in cf.items() if re.match(r"^B[EM]\d+W?$", k)}
            if red:
                g["B"] = red
            if r.col(80, 80) == "?":
                g["questionable"] = True
            if r.col(77, 77) == "&":
                g["uncertain_placement"] = True
            if levels:
                levels[-1]["gammas"].append(g)
            else:
                unplaced.append(g)
    # Photon branching ratios from the relative intensities, per level.
    for lev in levels:
        gs = lev["gammas"]
        tot = sum(g.get("I", 0) for g in gs if g.get("I") is not None and not g.get("I_limit"))
        if tot > 0:
            for g in gs:
                if g.get("I") is not None and not g.get("I_limit"):
                    g["BR"] = round(100 * g["I"] / tot, 4)
        if lev.get("E_keV") is not None:
            for g in gs:
                if g.get("E_keV") is not None:
                    # Nuclear recoil: E_level - E_final = E_g + E_g^2 / (2 M c^2).
                    recoil = g["E_keV"] ** 2 / (2 * mass_keV) if mass_keV else 0.0
                    g["E_final_keV"] = _final(levels, lev["E_keV"] - g["E_keV"] - recoil)
    hist = _history(ds.records)
    full = [h for h in hist if h.get("TYP") == "FUL"]
    ev = (full or hist or [{}])[-1]
    return {
        "nucid": ds.nucid,
        "dsid": ds.dsid,
        "dsref": ds.dsref,
        "pub": ds.pub,
        "date": ds.date,
        "evaluation": {"authors": ev.get("AUT"), "citation": ev.get("CIT"), "cutoff": ev.get("CUT"),
                       "type": ev.get("TYP")},
        "history": hist,
        "Q": q,
        "levels": levels,
        "unplaced_gammas": unplaced,
    }


def _final(levels: List[dict], e: float) -> Optional[float]:
    """The level energy closest to e (the γ's final level; recoil neglected,
    so within max(2 keV, 0.1 %))."""
    best = None
    for lev in levels:
        x = lev.get("E_keV")
        if x is None:
            continue
        if best is None or abs(x - e) < abs(best - e):
            best = x
    if best is not None and abs(best - e) <= max(2.0, 0.002 * abs(e)):
        return best
    return None


def nucid(A: int, sym: str) -> str:
    """ENSDF NUCID: mass right-justified in cols 1-3, symbol in 4-5 (upper case)."""
    return f"{A:>3d}{sym.upper():<2s}"

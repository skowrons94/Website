"""Curated corrections to EXFOR (scripts/data/corrections.yaml).

A correction names a subentry (every pointer) or a subentry and pointer, and
changes columns of its tables before anything reads them: a frame error is a
heading read as another (EN holds c.m. energies -> EN-CM), a unit error a
unit read as another (KEV holds MeV -> MEV), a scale error a factor. The
dataset then carries the flag `corrected` and `meta.corrections`, so the
pages and exports say what was changed. Entries with `apply: false` stay on
record only.
"""

import os
from typing import Dict, List, Optional

from . import config

FILE = os.path.join(config.DATA_DIR, "corrections.yaml")

_CACHE: Optional[List[dict]] = None


def load(path: str = FILE) -> List[dict]:
    global _CACHE
    if _CACHE is not None and path == FILE:
        return _CACHE
    import yaml
    with open(path) as f:
        items = yaml.safe_load(f) or []
    for c in items:
        for key in ("id", "problem", "correct", "evidence", "status", "reported_to_nrdc"):
            if key not in c:
                raise ValueError(f"corrections.yaml: {c.get('id', '?')} lacks {key}")
        for ch in c["correct"]:
            if "column" not in ch or not ({"heading", "unit", "factor"} & set(ch)):
                raise ValueError(f"corrections.yaml: {c['id']}: a change needs a column and a heading, unit or factor")
    if path == FILE:
        _CACHE = items
    return items


def for_dataset(sid: str, path: str = FILE) -> List[dict]:
    """The applied corrections of dataset `sid` ("F0580.002" or "O2548.002.1")."""
    parts = sid.split(".")
    sub = ".".join(parts[:2])
    return [c for c in load(path) if c.get("apply", True) and c["id"] in (sid, sub)]


def yes_no(v) -> str:
    """YAML reads a bare no/yes as a boolean."""
    return "no" if v is False else "yes" if v is True else str(v)


def apply(cols: Dict[str, "object"], corrections: List[dict]) -> List[dict]:
    """Change the columns in place; returns what was done, for meta.corrections."""
    done = []
    for c in corrections:
        changes = []
        for ch in c["correct"]:
            name = ch["column"]
            col = cols.get(name)
            if col is None:
                raise ValueError(f"correction {c['id']}: no column {name}")
            if "factor" in ch:
                f = float(ch["factor"])
                col.values = [None if v is None else v * f for v in col.values]
                changes.append(f"{name} x {ch['factor']}")
            if "unit" in ch:
                changes.append(f"{name} unit {col.unit.strip()} -> {ch['unit']}")
                col.unit = ch["unit"]
            if "heading" in ch:
                new = ch["heading"]
                del cols[name]
                col.name = new
                col.renamed_from = name
                cols[new] = col
                changes.append(f"{name} read as {new}")
        done.append({"id": c["id"], "problem": c["problem"], "change": "; ".join(changes),
                     "status": c["status"], "reported_to_nrdc": yes_no(c["reported_to_nrdc"])})
    return done


REPORT = os.path.join(config.DATA_DIR, "nrdc-report.md")


def report(path: str = FILE) -> str:
    """The draft report to the NRDC (scripts/data/nrdc-report.md), from the table."""
    src = config.sources()["exfor_master"]
    items = load(path)
    applied = [c for c in items if c.get("apply", True)]
    held = [c for c in items if not c.get("apply", True)]
    lines = [
        "# Draft: compilation errors in EXFOR, for the NRDC",
        "",
        "Generated from `scripts/data/corrections.yaml` by `python scripts/data/dx.py nrdc-report`;",
        "do not edit by hand. **Draft: not sent.** Every item was checked against the",
        f"EXFOR file of exfor_master commit `{src['commit']}` ({src['snapshot_date']});",
        "each still needs confirming from the paper before it is reported.",
        "",
        "To: the NRDC network, via the IAEA Nuclear Data Section (address to fill in)",
        "",
        "Dear colleagues,",
        "",
        "while building a public explorer of the EXFOR data for nuclear astrophysics, we found the",
        f"following {len(applied)} subentries whose energies or values are given in the wrong frame,",
        "unit or scale. We correct them on our site and would be glad to see them corrected in EXFOR.",
        "",
        "| Subentry | Reaction | Problem | Correction | Reported |",
        "|---|---|---|---|---|",
    ]
    for c in applied:
        change = "; ".join(_describe(ch) for ch in c["correct"])
        lines.append(f"| {c['id']} | {c['reaction']} | {c['problem']} | {change} | {yes_no(c['reported_to_nrdc'])} |")
    lines.append("")
    for c in applied:
        lines += [f"## {c['id']}: {c['reaction']}", "", f"Paper: {c['paper']}.", "", f"Problem: {c['problem']}", "",
                  "Evidence:", ""]
        lines += [f"- {e}" for e in c["evidence"]]
        lines += ["", f"Status: {c['status']}.", ""]
    if held:
        lines += ["## Not reported (not verifiable from the EXFOR file)", ""]
        for c in held:
            lines += [f"- {c['id']} ({c['reaction']}): {c['problem']} {c['status']}."]
        lines.append("")
    lines += ["With best regards,", "", "Jakub Skowronski", ""]
    return "\n".join(lines)


def _describe(ch: dict) -> str:
    out = []
    if "heading" in ch:
        out.append(f"{ch['column']} is {ch['heading']}")
    if "unit" in ch:
        out.append(f"{ch['column']} unit is {ch['unit']}")
    if "factor" in ch:
        out.append(f"{ch['column']} x {ch['factor']}")
    return ", ".join(out)

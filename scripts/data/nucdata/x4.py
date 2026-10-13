"""A reader for EXFOR exchange-format (.x4) entries, as stored in
IAEA-NDS/exfor_master (one entry per file, 80-column records).

The format (NRDC, "EXFOR Formats Description for Users", LEXFOR):

* columns 1-10 keyword, 11 pointer, 12-66 text (BIB) or six 11-column
  fields (COMMON/DATA and system records), 67-79 record id;
* ENTRY / SUBENT records carry N1 = number, N2 = date of the last
  alteration (YYYYMMDD);
* BIB keywords hold coded information in parentheses at the start of an
  item, then free text; an item continues on lines with a blank keyword;
* COMMON and DATA tables: N1 headings (pointer in the 11th column of each
  heading field), the same number of units, then the rows, each row
  wrapped onto ceil(N1/6) lines.

The reader is deliberately small and strict about structure and liberal about
numbers (EXFOR permits `1.23+4` for 1.23E+4).  It never interprets physics;
see dataset.py for that.
"""

import math
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

_NUM = re.compile(r"^([-+]?(?:\d+\.?\d*|\.\d+))(?:[EeDd]?([-+]\d+)|[EeDd](\d+))?$")


def number(text: str) -> Optional[float]:
    """An EXFOR numeric field, or None if blank or not a number."""
    s = text.strip().replace(" ", "")
    if not s:
        return None
    m = _NUM.match(s)
    if not m:
        return None
    mant = float(m.group(1))
    exp = m.group(2) or m.group(3)
    v = mant * 10 ** int(exp) if exp else mant
    if math.isnan(v) or math.isinf(v):
        return None
    return v


def decimals(text: str) -> int:
    """Number of significant figures written in a field (for output rounding)."""
    s = text.strip().split("E")[0].split("e")[0].lstrip("+-")
    s = re.split(r"(?<=\d)[-+]", s)[0]
    digits = s.replace(".", "").lstrip("0")
    return max(1, len(digits))


@dataclass
class Item:
    """One BIB item: its pointer, its full text (newline-joined)."""
    pointer: str
    text: str

    @property
    def code(self) -> str:
        """The leading parenthesised code (without the outer parentheses), or ''."""
        return leading_code(self.text)[0]

    @property
    def free(self) -> str:
        """The free text after the leading code."""
        return leading_code(self.text)[1]


def leading_code(text: str) -> Tuple[str, str]:
    flat = text.replace("\n", "")
    if not flat.startswith("("):
        return "", " ".join(text.split())
    depth = 0
    for j, ch in enumerate(flat):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                # Free text is taken from the original (with line breaks) after
                # the code's characters, to keep its wording intact.
                rest = _after(text, j + 1)
                return flat[1:j], " ".join(rest.split())
    return flat[1:], ""


def _after(text: str, nchars: int) -> str:
    """The part of text after its first nchars non-newline characters."""
    seen = 0
    for i, ch in enumerate(text):
        if ch == "\n":
            continue
        if seen == nchars:
            return text[i:]
        seen += 1
    return ""


@dataclass
class Table:
    heads: List[Tuple[str, str]]   # (heading, pointer)
    units: List[str]
    rows: List[List[str]]          # raw fields, stripped


@dataclass
class Subentry:
    entry: str
    number: str                    # '001', '002', ...
    date: str                      # N2 of the SUBENT record, YYYYMMDD
    bib: Dict[str, List[Item]] = field(default_factory=dict)
    common: Optional[Table] = None
    data: Optional[Table] = None

    @property
    def id(self) -> str:
        return f"{self.entry}.{self.number}"

    def items(self, keyword: str) -> List[Item]:
        return self.bib.get(keyword, [])


@dataclass
class Entry:
    id: str
    date: str
    subentries: List[Subentry]
    nosubent: List[str] = field(default_factory=list)

    @property
    def first(self) -> Optional[Subentry]:
        for s in self.subentries:
            if s.number == "001":
                return s
        return None


def _fields(line: str, n: int = 6) -> List[str]:
    line = line.ljust(66)
    return [line[i * 11:(i + 1) * 11] for i in range(n)]


def _table(lines: List[str], i: int, n1: int, n2: int) -> Tuple[Table, int]:
    per = max(1, math.ceil(n1 / 6))
    heads, units = [], []
    for k in range(per):
        heads += [(f[:10].strip(), f[10:11].strip()) for f in _fields(lines[i + k])]
    i += per
    for k in range(per):
        units += [f.strip() for f in _fields(lines[i + k])]
    i += per
    heads, units = heads[:n1], units[:n1]
    rows = []
    for _ in range(n2):
        cur: List[str] = []
        for k in range(per):
            if i >= len(lines) or lines[i].startswith(("ENDDATA", "ENDCOMMON")):
                break
            cur += _fields(lines[i])
            i += 1
        if not cur:
            break
        rows.append([c.strip() for c in cur[:n1]])
    while i < len(lines) and not lines[i].startswith(("ENDDATA", "ENDCOMMON")):
        i += 1
    return Table(heads, units, rows), i + 1


def _balanced(text: str) -> bool:
    return text.count("(") == text.count(")")


def _bib(lines: List[str], i: int) -> Tuple[Dict[str, List[Item]], int]:
    bib: Dict[str, List[Item]] = {}
    key = None
    while i < len(lines) and not lines[i].startswith("ENDBIB"):
        line = lines[i].ljust(66)
        kw, ptr, text = line[:10].strip(), line[10:11].strip(), line[11:66].rstrip()
        if kw:
            key = kw
            bib.setdefault(key, []).append(Item(ptr, text))
        elif key is not None:
            items = bib[key]
            last = items[-1]
            # A new item starts with a pointer, or with "(" once the previous
            # item's parentheses are closed (a coded item, e.g. a second
            # reference or the next flag).
            new = bool(ptr) or (text.startswith("(") and _balanced(last.text)
                                and _code_complete(last.text))
            if new:
                items.append(Item(ptr, text))
            else:
                last.text += "\n" + text
        i += 1
    return bib, i + 1


def _code_complete(text: str) -> bool:
    return text.startswith("(") and _balanced(text.replace("\n", ""))


def parse_entry(text: str, entry_id: Optional[str] = None) -> Entry:
    """Parse the text of one .x4 entry file."""
    lines = text.replace("\r", "").split("\n")
    eid, edate = entry_id or "", ""
    subs: List[Subentry] = []
    nosub: List[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("ENTRY "):
            eid = line[11:22].strip() or eid
            edate = line[22:33].strip()
        elif line.startswith("NOSUBENT"):
            nosub.append(line[11:22].strip()[-3:])
        elif line.startswith("SUBENT"):
            num = line[11:22].strip()
            sub = Subentry(entry=eid or num[:5], number=num[-3:], date=line[22:33].strip())
            i += 1
            while i < len(lines) and not lines[i].startswith(("ENDSUBENT", "SUBENT", "NOSUBENT", "ENDENTRY")):
                l = lines[i]
                if l.startswith("BIB "):
                    sub.bib, i = _bib(lines, i + 1)
                    continue
                if l.startswith("COMMON ") or l.startswith("DATA "):
                    n1, n2 = int(l[11:22]), int(l[22:33])
                    tab, i = _table(lines, i + 1, n1, n2)
                    if l.startswith("COMMON"):
                        sub.common = tab
                    else:
                        sub.data = tab
                    continue
                i += 1
            subs.append(sub)
            if i < len(lines) and lines[i].startswith(("SUBENT", "NOSUBENT", "ENDENTRY")):
                continue    # a SUBENT record with no body: the next record starts at once
        i += 1
    return Entry(eid, edate, subs, nosub)


# -- reaction codes ------------------------------------------------------

# One reaction unit: SF1(SF2,SF3)SF4,SF5,SF6,SF7,SF8,SF9 inside parentheses.
_UNIT = re.compile(r"\(([0-9]+-[A-Z0-9]+-[0-9A-Z]+(?:-[A-Z0-9/]+)?)\(([^()]*)\)([^()]*)\)")


@dataclass
class Primitive:
    target: str        # SF1, e.g. 7-N-14, 6-C-0 (natural), 95-AM-242-M
    projectile: str    # SF2
    process: str       # SF3 (ejectiles, EL, INL, TOT, X ...)
    product: str       # SF4
    branch: str        # SF5 (PAR, CUM, ...)
    parameter: str     # SF6 (SIG, DA, POL/DA, WID/STR, ...)
    particle: str      # SF7
    modifier: str      # SF8 (SFC, REL, MXW, SPA, ANA, ...)
    data_type: str     # SF9 (EXP, CALC, EVAL, DERIV, RECOM)

    def quantity(self) -> str:
        return ",".join([self.branch, self.parameter, self.particle, self.modifier,
                         self.data_type]).rstrip(",")

    def to_dict(self) -> dict:
        return {"sf1": self.target, "sf2": self.projectile, "sf3": self.process,
                "sf4": self.product, "sf5": self.branch, "sf6": self.parameter,
                "sf7": self.particle, "sf8": self.modifier, "sf9": self.data_type}


def primitives(code: str) -> List[Primitive]:
    """The reaction units of a code as returned by Item.code (outer
    parentheses removed): one for a simple code, several for a ratio etc."""
    wrapped = code if code.startswith("(") else f"({code})"
    out = []
    for tgt, proc, rest in _UNIT.findall(wrapped):
        proj, _, ejec = proc.partition(",")
        sf = rest.split(",")
        sf += [""] * (6 - len(sf))
        out.append(Primitive(tgt, proj, ejec, sf[0], sf[1], sf[2], sf[3], sf[4],
                             ",".join(sf[5:]).strip(",")))
    return out


def is_complex(code: str) -> bool:
    """A ratio, sum, product... of reactions (more than one unit, or an
    operator between units)."""
    wrapped = code if code.startswith("(") else f"({code})"
    return code.startswith("(") or len(_UNIT.findall(wrapped)) != 1

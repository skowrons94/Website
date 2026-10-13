"""The EXFOR reader: numbers, BIB items, tables, subentry structure."""

import pytest

from conftest import read
from nucdata import x4


@pytest.mark.parametrize("text,value", [
    ("1.23+4", 1.23e4), ("-1.2-3", -1.2e-3), (" 2.5E-03", 2.5e-3), ("1.", 1.0), ("0.", 0.0),
    ("4.0+1", 40.0), ("3.0-2", 0.03), (".5", 0.5), ("1.0D+00", 1.0), ("", None), ("abc", None),
])
def test_numbers(text, value):
    got = x4.number(text)
    assert got == pytest.approx(value) if value is not None else got is None


def test_entry_structure_and_bib():
    e = x4.parse_entry(read("exfor", "O1195.x4"))
    assert e.id == "O1195" and e.date == "20220202"
    assert [s.number for s in e.subentries] == ["001", "002", "003", "004"]
    first = e.first
    refs = first.items("REFERENCE")
    assert [r.code for r in refs] == ["J,EPJ/A,25,(3),455,2005", "J,PL/B,591,61,2004"]
    assert refs[1].free == "Preliminary communication."
    assert len(first.items("HISTORY")) == 6
    assert first.items("INSTITUTE")[0].code.startswith("2ITYNAP,2ITYGVA")
    sub = e.subentries[1]
    assert sub.items("FLAG")[0].code == "1." and "Extrapolated" in sub.items("FLAG")[0].free
    assert [h for h, _ in sub.data.heads] == ["E-LVL", "EN-CM", "DATA", "ERR-T", "FLAG"]
    assert sub.data.units[2] == "B*KEV"
    assert len(sub.data.rows) == 108


def test_wrapped_rows_and_pointers():
    e = x4.parse_entry(read("exfor", "O1709.x4"))
    sub = [s for s in e.subentries if s.number == "002"][0]
    heads = sub.data.heads
    assert len(heads) == 9 and len(sub.data.rows) == 6 and all(len(r) == 9 for r in sub.data.rows)
    assert heads[2] == ("ERR-T", "1") and heads[6] == ("ERR-SYS", "2")
    reactions = sub.items("REACTION")
    assert [(r.pointer, r.code) for r in reactions] == [
        ("1", "2-HE-3(A,G)4-BE-7,,SIG"), ("2", "2-HE-3(A,G)4-BE-7,,SIG,,SFC")]


def test_empty_subent_and_nosubent():
    e = x4.parse_entry(read("exfor", "T0001.x4"))
    assert [s.number for s in e.subentries] == ["001", "002", "003"]
    assert e.subentries[1].data is None and e.subentries[1].bib == {}
    assert e.nosubent == ["004"]
    assert e.subentries[2].data.rows[2][2] == "3.0-2"


@pytest.mark.parametrize("code,n,cx", [
    ("7-N-14(P,G)8-O-15,PAR,SIG,,SFC", 1, False),
    ("(6-C-12(P,G)7-N-13,,SIG)/(6-C-13(P,G)7-N-14,,SIG)", 2, True),
    ("6-C-0(P,X)7-N-13,,SIG", 1, False),
    ("3-LI-6(P,HE3)2-HE-4,,DA,,SFC", 1, False),
    ("6-C-12(6-C-12,P)11-NA-23,PAR,SIG", 1, False),
])
def test_reaction_codes(code, n, cx):
    prims = x4.primitives(code)
    assert len(prims) == n
    assert x4.is_complex(code) is cx
    p = prims[0]
    assert p.target and p.projectile and p.parameter


def test_reaction_fields():
    p = x4.primitives("7-N-14(P,G)8-O-15,PAR,SIG,,SFC")[0]
    assert (p.target, p.projectile, p.process, p.product, p.branch, p.parameter, p.particle, p.modifier,
            p.data_type) == ("7-N-14", "P", "G", "8-O-15", "PAR", "SIG", "", "SFC", "")
    q = x4.primitives("26-FE-56(N,G)26-FE-57,,SIG,,MXW,EXP")[0]
    assert q.modifier == "MXW" and q.data_type == "EXP"

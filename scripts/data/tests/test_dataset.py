"""Datasets: frames, units, error components, flags, extrapolated rows."""

import pytest

from conftest import read
from nucdata import dataset, masses, x4
from nucdata.scope import slices


def sets(name):
    return {d.meta["id"]: d for d in dataset.datasets(x4.parse_entry(read("exfor", f"{name}.x4")),
                                                      ("2022-07-21", 6))}


def test_o1195_extrapolated_rows_are_not_data():
    ds = sets("O1195")
    d = ds["O1195.002"]
    m, p = d.meta, d.points
    # The S(0) rows (EN-CM = 0, FLAG 1 "Extrapolated value.") are excluded, one per final level.
    assert m["nexcluded"] == 5 and m["npts"] == 103
    assert all(r["reason"].startswith("extrapolated (FLAG 1") for r in d.excluded)
    assert {r["E_level"] for r in d.excluded} == {0.0, 5.183, 5.241, 6.173, 6.793}
    assert min(p["E_cm"]) == pytest.approx(0.1189)
    assert 0.0 not in p["E_cm"]
    assert "has-extrapolated-rows" in m["flags"]
    # Subentry 003 is the total S(0) only: nothing left as data.
    assert ds["O1195.003"].meta["npts"] == 0 and ds["O1195.003"].meta["nexcluded"] == 1


def test_o1195_units_frames_levels():
    d = sets("O1195")["O1195.002"]
    m, p = d.meta, d.points
    assert m["quantity_class"] == "S" and m["value_unit"] == "MeV b"
    assert m["E_frame"] == "cm" and m["E_source"] == "EN-CM"
    assert m["final_levels"] == [0.0, 5.183, 5.241, 6.173, 6.793]
    i = p["E_cm"].index(0.1189)
    assert p["value"][i] == pytest.approx(0.04e-3)        # 0.04 b keV
    # E_lab of the proton from E_cm: E_lab = E_cm (m_p + m_t)/m_t, relativistic correction tiny.
    mp, mt = masses.nuclear_mass(1, 1), masses.nuclear_mass(14, 7)
    assert p["E_lab"][i] == pytest.approx(0.1189 * (mp + mt) / mt, rel=1e-5)
    assert m["entry_updated"] == "2022-07-21" and m["entry_revisions"] == 6
    assert m["refs"][0]["journal"].startswith("European Physical Journal A")
    assert m["year"] == 2005 and m["first_author"] == "Imbriani"
    assert {i["code"] for i in m["institutes"]} >= {"2ITYLGS"}
    assert m["facility"][0]["code"] == "ACCEL"


def test_error_components_kept_apart():
    d = sets("O1195")["O1195.002"]
    comps = {c["name"]: c for c in d.meta["err_components"]}
    assert comps["ERR-1"] == {"name": "ERR-1", "kind": "sys", "where": "common", "unit": "PER-CENT",
                              "relative": True, "value": 2.0,
                              "text": "The uncertainty in the beam current integrator"}
    assert comps["ERR-T"]["kind"] == "total" and d.meta["d_tot_source"] == "ERR-T"
    assert d.meta["err_columns"] == {"ERR-T": "d_tot"}

    d4 = sets("D4400")
    m = d4["D4400.003"].meta
    kinds = {c["name"]: (c["kind"], c["where"]) for c in m["err_components"]}
    assert kinds["ERR-S"] == ("stat", "point") and kinds["ERR-SYS"] == ("sys", "common")
    p = d4["D4400.003"].points
    assert p["d_stat"][0] == pytest.approx(0.15e-6)
    assert p["d_sys"][0] == pytest.approx(0.046 * 6.02e-6, rel=1e-3)
    assert "superseded" not in m["flags"]
    assert "superseded" in d4["D4400.002"].meta["flags"]


def test_rowwise_total_and_duplicate_headings():
    d = sets("O1709")
    one = d["O1709.002.1"]
    # ERR-T given on some rows, ERR-S on the others: the total falls back row by row.
    assert one.points["d_tot"][0] == pytest.approx(0.01e-9)
    assert one.points["d_tot"][2] is not None
    two = d["O1709.002.2"]
    names = {c["name"] for c in two.meta["err_components"]}
    assert {"ERR-S", "ERR-S#2", "ERR-SYS", "ERR-SYS#2"} <= names


def test_limits_digitised_pointers():
    e = x4.parse_entry(read("exfor", "T0001.x4"))
    ds = {d.meta["id"]: d for d in dataset.datasets(e)}
    assert set(ds) == {"T0001.003.1", "T0001.003.2"}
    one = ds["T0001.003.1"]
    assert one.points["limit"] == [None, "<", None]
    assert one.points["value"][1] == pytest.approx(0.03e-3)
    assert {"digitised", "upper-limits", "has-extrapolated-rows"} <= set(one.meta["flags"])
    assert one.excluded[0]["E"] == 0.0
    assert one.meta["doi"] == "10.0000/test.0001"
    two = ds["T0001.003.2"]
    assert two.points["err"]["ERR-DIG"][0] == pytest.approx(0.1e-3)
    assert two.meta["d_tot_source"].startswith("combined:")


def test_reaction_keys_and_scope():
    p = x4.primitives("7-N-14(P,G)8-O-15,PAR,SIG,,SFC")[0]
    assert dataset.reaction_key(p) == "14N(p,g)" and dataset.reaction_slug("14N(p,g)") == "14N-p-g"
    assert slices(p) == ["A"]
    assert slices(x4.primitives("79-AU-197(N,G)79-AU-198,,SIG,,MXW")[0]) == ["B", "M"]
    assert slices(x4.primitives("26-FE-56(N,G)26-FE-57,,SIG")[0]) == ["B", "N"]
    assert slices(x4.primitives("92-U-235(N,F),,SIG")[0]) == []
    assert slices(x4.primitives("50-SN-120(P,G)51-SB-121,,SIG")[0]) == []
    assert slices(x4.primitives("6-C-12(6-C-12,P)11-NA-23,,SIG")[0]) == ["A"]
    assert slices(x4.primitives("6-C-12(10-NE-20,X)0-NN-1,,SIG")[0]) == []
    assert dataset.reaction_key(x4.primitives("3-LI-6(P,HE3)2-HE-4,,SIG")[0]) == "6Li(p,3He)"
    assert dataset.reaction_key(x4.primitives("6-C-0(P,X)7-N-13,,SIG")[0]) == "natC(p,x)"


@pytest.mark.parametrize("p,cls", [
    ("7-N-14(P,G)8-O-15,PAR,SIG,,SFC", "S"), ("7-N-14(P,G)8-O-15,PAR,SIG", "sigma"),
    ("7-N-14(P,P)7-N-14,,DA", "dsigma"), ("7-N-14(P,P)7-N-14,,POL/DA,,ANA", "pol"),
    ("13-AL-27(P,G)14-SI-28,,WID/STR", "strength"), ("26-FE-56(N,G)26-FE-57,,SIG,,MXW", "macs"),
    ("26-FE-56(N,G)26-FE-57,,SIG,,SPA", "sacs"), ("6-C-13(A,N)8-O-16,,TTY", "yield"),
    ("7-N-14(P,G)8-O-15,PAR,DA,,LEG/RS", "legendre"),
])
def test_quantity_classes(p, cls):
    prim = x4.primitives(p)[0]
    assert dataset.quantity_class(prim, False) == cls

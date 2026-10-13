"""The committed outputs (public/data): regression counts on known reactions,
schemas, size budgets, attribution metadata."""

import gzip
import json
import os

import pytest

from conftest import PUBLIC_DATA
from nucdata import build_exfor, config

jsonschema = pytest.importorskip("jsonschema")


def load(*parts):
    with open(os.path.join(PUBLIC_DATA, *parts)) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def index():
    return load("exfor", "index.json")


def schema(name):
    with open(os.path.join(config.SCHEMA_DIR, f"{name}.schema.json")) as f:
        return json.load(f)


def reaction(index, key):
    D = index["datasets"]
    r = index["reactions"]["key"].index(key)
    rows = [i for i, x in enumerate(D["r"]) if x == r]
    return rows, D


@pytest.mark.parametrize("key,sets,entries", [
    ("14N(p,g)", 126, 31), ("12C(a,g)", 64, 21), ("3He(a,g)", 44, 22),
    ("13C(a,n)", 65, 31), ("22Ne(a,n)", 16, 9), ("197Au(n,g)", 278, 187),
])
def test_known_reactions(index, key, sets, entries):
    rows, D = reaction(index, key)
    assert len(rows) == sets
    assert len({D["id"][i][:5] for i in rows}) == entries


def test_o1195_flags_in_index(index):
    D = index["datasets"]
    i = D["id"].index("O1195.002")
    bit = 1 << build_exfor.FLAG_BITS.index("has-extrapolated-rows")
    assert D["f"][i] & bit
    assert D["e0"][i] == pytest.approx(0.1189)          # lowest *measured* E_cm, not the S(0) row
    assert D["n"][i] == 103
    assert index["strings"]["authors"][D["a"][i]] == "Imbriani+"
    assert D["fr"][i] == 1                              # given in c.m.


def test_lowest_energies_are_cm_and_positive(index):
    D = index["datasets"]
    rows, _ = reaction(index, "14N(p,g)")
    derived = sum(1 << build_exfor.FLAG_BITS.index(f) for f in ("derived", "not-experimental"))
    measured = [D["e0"][i] for i in rows
                if D["e0"][i] is not None and D["q"][i] in (0, 1) and not D["f"][i] & derived]
    assert min(measured) == pytest.approx(0.0701, abs=0.001)     # LUNA (O1458), 70 keV
    # An S-factor derived from ANCs (D0253.004, SF9 DERIV) goes down to 1 keV: flagged, not data.
    i = D["id"].index("D0253.004")
    assert D["f"][i] & derived and D["e0"][i] < 0.002


def test_scope_slices(index):
    meta = load("meta.json")
    per = meta["counts"]["per_slice"]
    assert per["A"] > 45000 and per["B"] > 10000 and per["M"] > 5000 and per["N"] > 20000
    assert meta["counts"]["datasets"] == len(index["datasets"]["id"])


def test_schemas(index):
    jsonschema.validate(load("meta.json"), schema("meta"))
    jsonschema.validate(index, schema("index"))
    for name in os.listdir(os.path.join(PUBLIC_DATA, "ensdf")):
        if name != "index.json":
            jsonschema.validate(load("ensdf", name), schema("ensdf"))


def test_schema_rejects_mixed_frames():
    bad = {"schema": "dx-ensdf", "schema_version": 1, "nuclide": "15O", "Z": 8, "A": 15,
           "separation": {"S_n": 1, "S_p": 1, "S_a": 1, "unit": "MeV", "source": "AME2020"}, "xundl": "x",
           "ensdf": {"nucid": "15O", "dsid": "ADOPTED LEVELS", "evaluation": {"citation": "x", "cutoff": "y"},
                     "levels": [{"E_keV": "5183", "gammas": []}]}}
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(bad, schema("ensdf"))


def test_budgets():
    with open(os.path.join(PUBLIC_DATA, "exfor", "index.json"), "rb") as f:
        gz = len(gzip.compress(f.read(), 6))
    assert gz <= config.BUDGET["index_gz"]
    if load("ensdf", "index.json")["meta"]["set"] == "atlas":      # the committed set
        total = sum(os.path.getsize(os.path.join(r, f))
                    for r, _, fs in os.walk(os.path.join(PUBLIC_DATA, "ensdf")) for f in fs)
        assert total <= config.BUDGET["ensdf_commit_total"]


def test_attribution():
    meta = load("meta.json")
    ex = meta["exfor"]
    assert ex["license"] == "CC BY 4.0" and ex["commit"] == config.sources()["exfor_master"]["commit"]
    assert ex["line"] == f"Data: EXFOR (IAEA/NRDC), snapshot {ex['snapshot_date']}, CC BY 4.0"
    assert "Nucl. Data Sheets 120, 272 (2014)" in ex["citation"]
    assert ex["entry_url"].format(entry="O1195") == "https://nds.iaea.org/EXFOR/O1195"
    assert ex["master_url"].format(commit=ex["commit"], dir="O11", entry="O1195").endswith(
        f"/blob/{ex['commit']}/exforall/O11/O1195.x4")
    en = meta["ensdf"]
    assert en["archive_date"] and en["xundl"] == "excluded" and "Nuclear Data Sheets" in en["citation"]


def test_atlas_nuclides_have_levels():
    listing = load("ensdf", "index.json")
    names = {n["nuclide"]: n for n in listing["nuclides"]}
    for nuc in ("15O", "13N", "7Be", "16O", "20Ne", "24Mg", "26Al"):
        assert names[nuc]["levels"] > 0 and names[nuc]["cutoff"]
    o15 = load("ensdf", "15O.json")
    assert o15["separation"]["S_p"] == pytest.approx(7.2968, abs=2e-4)
    lv = {round(l["E_keV"]) for l in o15["ensdf"]["levels"] if l["E_keV"] is not None}
    assert {0, 5183, 5241, 6176, 6793} <= lv

"""AZURE2 / CSV / BibTeX exports, cross-checked against the data files of the
site's own evaluations (server/evaluations/*/data), which were taken from
EXFOR by hand: the same numbers must come out of the pipeline."""

import csv
import io
import os

import pytest

from conftest import REPO, read
from nucdata import config, dataset, export, x4
from nucdata.build_exfor import links

SNAP = {"date": "2026-09-28", "commit": "d2af85eca4ce9b76529f096e7f9603da60654732"}
SRC = config.sources()["exfor_master"]


def load(entry):
    out = {}
    for d in dataset.datasets(x4.parse_entry(read("exfor", f"{entry}.x4"))):
        d.meta["links"] = links(d.meta, SRC)
        out[d.meta["id"]] = {"meta": d.meta, "points": d.points, "excluded": d.excluded}
    return out


def rows(text):
    return [[float(x) for x in line.split()] for line in text.strip().splitlines()]


# (evaluation data file, dataset, AZURE2 moving particle, masses, column-4 choice)
CASES = [
    ("7Be/data/Costantini-O1709001.dat", "O1709", "O1709.002.1", "target", "integer", "point"),
    ("7Be/data/Szucs-D4400001.dat", "D4400", "D4400.003", "target", "integer", "point"),
    ("7Be/data/Toth-D4430001.dat", "D4430", "D4430.002", "target", "integer", "stat"),
    ("7Be/data/Parker-A1088001.dat", "A1088", "A1088.002", "target", "integer", "point"),
    ("7Be/data/Switkowski-F0032001.dat", "F0032", "F0032.002", "projectile", "ame", "point"),
]


@pytest.mark.parametrize("path,entry,ds_id,particle,mm,err", CASES)
def test_azure2_matches_evaluation_files(path, entry, ds_id, particle, mm, err):
    with open(os.path.join(REPO, "server", "evaluations", path)) as f:
        ref = rows(f.read())
    ds = load(entry)[ds_id]
    files = export.azure2(ds, SNAP, lab_particle=particle, mass_model=mm, error=err)
    assert len(files) == 1 and "skip" not in files[0]
    mine = rows(files[0]["dat"])
    assert len(mine) == len(ref)
    for r, m in zip(sorted(ref), sorted(mine)):
        assert m[0] == pytest.approx(r[0], rel=1e-4)      # E_lab, MeV
        assert m[1] == r[1]                               # angle
        assert m[2] == pytest.approx(r[2], rel=1e-6)      # sigma, b
        assert m[3] == pytest.approx(r[3], rel=1e-6)      # uncertainty, b


def test_azure2_header_and_columns():
    ds = load("O1195")["O1195.002"]
    files = export.azure2(ds, SNAP)
    assert [f["level"] for f in files] == [0.0, 5.183, 5.241, 6.173, 6.793]
    f = files[-1]
    assert f["stem"] == "Imbriani-O1195002-6793"
    head = [l[2:] for l in f["csv"].splitlines() if l.startswith("# ")]
    text = "\n".join(head)
    for needle in ("EXFOR dataset: O1195.002", "https://nds.iaea.org/EXFOR/O1195",
                   "github.com/IAEA-NDS/exfor_master/blob/d2af85eca4ce9b76529f096e7f9603da60654732/exforall/O11/O1195.x4",
                   "Revision: entry 2022", "Reaction code: (7-N-14(P,G)8-O-15,PAR,SIG,,SFC)",
                   "Frame: energy given as EN-CM (cm)", "Systematic (common) uncertainty: 2 %",
                   "converted for AZURE2 to sigma = S/E_cm exp(-2 pi eta)", "Excluded rows: 5",
                   "CC BY 4.0", "Otuka"):
        assert needle in text, needle
    table = list(csv.reader(io.StringIO("\n".join(l for l in f["csv"].splitlines() if not l.startswith("#")))))
    assert table[0][:4] == ["E_lab_azure2_MeV", "E_cm_MeV", "E_lab_projectile_MeV", "angle_deg"]
    assert len(table) - 1 == len(rows(f["dat"]))
    # Segment stub: a partial capture (exit pair to fill in), angle-integrated, 2 % normalisation.
    seg = f["segment"].split()
    assert seg[1] == "ENTR" and seg[2] == "EXIT" and seg[7] == "0" and seg[10] == "2"
    assert seg[14] == "data/Imbriani-O1195002-6793.dat"


def test_s_factor_conversion_is_consistent():
    ds = load("O1709")
    s = export.azure2(ds["O1709.002.2"], SNAP, lab_particle="target", mass_model="integer")[0]
    sig = export.azure2(ds["O1709.002.1"], SNAP, lab_particle="target", mass_model="integer")[0]
    a, b = rows(s["dat"]), rows(sig["dat"])
    # sigma from S at 92.9 keV against the measured sigma (2.32e-10 b): same to ~1 %
    # (the authors' S and sigma are rounded to 3 digits).
    assert a[0][2] == pytest.approx(b[0][2], rel=0.02)


def test_total_capture_segment_and_bibtex_csv():
    ds = load("D4400")
    f = export.azure2(ds["D4400.003"], SNAP)[0]
    seg = f["segment"].split()
    assert seg[2] == "-1" and seg[7] == "3" and float(seg[10]) == pytest.approx(4.6)
    bib = export.bibtex(list(ds.values()))
    assert bib.count("@article{") == 1 and "Szucs2019_D4400" in bib
    assert "EXFOR D4400.002, D4400.003" in bib and "volume = {99}" in bib
    text = export.csv_long(list(ds.values()))
    assert text.splitlines()[0].startswith("id,reaction,quantity,E_frame_given,E_lab_MeV,E_cm_MeV")
    assert len(text.splitlines()) == 1 + 22


def test_non_azure2_quantities_are_skipped():
    ds = load("O1195")["O1195.004"]       # Legendre coefficients
    out = export.azure2(ds, SNAP)
    assert "skip" in out[0]

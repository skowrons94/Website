"""Channel labels and evaluation metadata, checked against the shipped models.

Run from ``server/`` with pyazr importable::

    PYTHONPATH=<pyazr> python3 -m unittest discover -s tests

Needs only the file parser (``pyazr.AzrModel`` and ``SegmentSet``), not the
engine, except for the one test that opens 24Mg, which is skipped when the
compiled module is missing.
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.dirname(HERE)
sys.path.insert(0, SERVER)

from app import evaluations as E  # noqa: E402
from app import labels as L  # noqa: E402

ROOT = os.path.join(SERVER, "evaluations")


def load(eid):
    return E.load(os.path.join(ROOT, eid))


class LabelsFromFile(unittest.TestCase):
    def test_24mg_labels_are_keyed_by_file_pair(self):
        ev = load("24Mg")
        by_key = {c.number: c for c in ev.labels}
        # The .azr numbers 12C+12C as pair 1 and p+23Na as pair 2; the data
        # enter through pair 2.  Labels must follow the file's keys.
        self.assertEqual((by_key[1].Z1, by_key[1].Z2), (6, 6))
        self.assertEqual(by_key[2].label, "p_{0}")
        self.assertTrue(by_key[4].is_photon)
        self.assertEqual(by_key[6].label, "\\alpha_{1}")
        self.assertFalse(by_key[6].is_photon)
        self.assertEqual(ev.entrance_key, 2)
        self.assertEqual(ev.to_dict()["entrance"], "p + ^{23}\\text{Na}")
        self.assertEqual(ev.title, "^{24}\\text{Mg}")

    def test_13n_has_one_capture_channel(self):
        ev = load("13N")
        self.assertEqual(ev.channels, ["p", "\\gamma"])

    def test_reactions_in_info_match_the_data(self):
        """info.json's reaction list must describe what the .azr fits."""
        from pyazr.datasets import SegmentSet
        for eid in sorted(os.listdir(ROOT)):
            ev = load(eid)
            if ev is None:
                continue
            derived = L.reactions(SegmentSet.from_file(ev.azr_path), ev.labels)
            with open(os.path.join(ev.path, "info.json"), encoding="utf-8") as f:
                listed = json.load(f).get("reactions")
            if listed:
                self.assertEqual(sorted(listed), sorted(derived), eid)

    def test_reaction_notation(self):
        ev = load("7Be")
        self.assertIn("³He(α,γ)⁷Be", ev.reactions)
        self.assertIn("⁶Li(p,α)³He", ev.reactions)
        self.assertEqual(load("24Mg").reactions, ["²³Na(p,p)²³Na"])


class DatasetLabels(unittest.TestCase):
    def test_derived(self):
        self.assertEqual(E.dataset_label("kettner_0"), "Kettner")
        self.assertEqual(E.dataset_label("Elwyn-F0012002"),
                         "Elwyn (EXFOR F0012.002)")
        self.assertEqual(E.dataset_label("ferraro2018"), "Ferraro (2018)")
        self.assertEqual(E.dataset_label("fels_2312"), "Felsenkeller")
        self.assertEqual(E.exfor_code("Caciolli_D0458001"), "D0458.001")
        self.assertIsNone(E.exfor_code("kettner_0"))

    def test_doi(self):
        ev = load("13N")
        self.assertEqual(ev.doi, "10.1103/PhysRevC.111.035802")
        self.assertIsNone(load("24Mg").doi)


class EnginePairs(unittest.TestCase):
    """The engine renumbers pairs; the serializers must map them back."""

    def test_24mg_scheme_pairs(self):
        try:
            import pyazr  # noqa: F401
            from pyazr import _azure2  # noqa: F401
        except ImportError:
            self.skipTest("compiled AZURE2 module not available")
        import pyazr
        from app import serializers
        ev = load("24Mg")
        azr = pyazr.azure2(ev.azr_path, cwd=ev.path)
        try:
            keys = {p.number: p.key for p in azr.pairs}
            self.assertNotEqual(list(keys), list(keys.values()))

            class Fake:
                pairs = azr.pairs
                scheme = azr.level_scheme
                params = list(azr.params)
                is_modified = False
            out = serializers.scheme_to_dict(Fake, ev.labels)
            pairs = {p["number"]: p for p in out["pairs"]}
            self.assertEqual(pairs[1]["Z1"], 6)          # 12C + 12C
            self.assertAlmostEqual(pairs[1]["separation_energy"], 13.9336, 3)
            self.assertEqual(pairs[2]["label"], "p_{0}")
            self.assertAlmostEqual(pairs[2]["separation_energy"], 11.6927, 3)
            self.assertTrue(pairs[4]["is_photon"])
            self.assertFalse(pairs[6]["is_photon"])
            for level in out["levels"]:
                for ch in level["channels"]:
                    self.assertEqual(ch["is_photon"], ch["pair"] == 4)
        finally:
            azr.close()


if __name__ == "__main__":
    unittest.main()

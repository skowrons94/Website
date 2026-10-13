"""The evaluation checks (app.check), the add-evaluation command and app.warm's
reporting, against the shipped evaluations and copies of 8Be with the mistakes
a person adding an evaluation actually makes.

Run from ``server/``::

    PYTHONPATH=<pyazr> python3 -m pytest tests/test_check.py

Only the add-evaluation test that fills in the reactions needs pyazr (it is
skipped without it); the rest is plain Python.  When ``node`` is installed,
the site's checker (scripts/evaluations-check.mjs) is run on the same broken
copies, so the two checkers cannot drift apart.
"""

import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.dirname(HERE)
REPO = os.path.dirname(SERVER)
sys.path.insert(0, SERVER)
sys.path.insert(0, os.path.join(REPO, "scripts"))

from app import check  # noqa: E402
from app import warm  # noqa: E402

ROOT = os.path.join(SERVER, "evaluations")
ATLAS = os.path.join(REPO, "content", "atlas", "reactions")
# The site's own checker needs the npm dependencies; without them (the
# Pages workflow runs these tests before `npm ci`) only app.check is tested.
NODE = (shutil.which("node")
        if os.path.isdir(os.path.join(REPO, "node_modules", "js-yaml"))
        else None)

try:
    import pyazr  # noqa: F401
    HAVE_PYAZR = True
except ImportError:
    HAVE_PYAZR = False


def errors(problems):
    return [p.message for p in problems if p.level == "error"]


class Shipped(unittest.TestCase):
    def test_every_shipped_evaluation_passes(self):
        problems = check.check_root(ROOT)
        self.assertEqual(errors(problems), [])

    def test_every_shipped_dataset_names_its_publication(self):
        # authors, a ref with its year and a doi (or null), or a pending reason.
        for eid in sorted(os.listdir(ROOT)):
            path = os.path.join(ROOT, eid, "info.json")
            if not os.path.isfile(path):
                continue
            with open(path, encoding="utf-8") as f:
                datasets = json.load(f)["datasets"]
            for key, entry in datasets.items():
                with self.subTest(evaluation=eid, dataset=key):
                    self.assertIsInstance(entry, dict)
                    if "ref" not in entry:
                        self.assertTrue(entry.get("pending"))
                        continue
                    self.assertTrue(entry.get("authors"))
                    self.assertRegex(entry["ref"], check.YEAR)
                    self.assertIn("doi", entry)

    def test_schema_is_valid_json_with_the_status_values(self):
        schema = check.load_schema()
        self.assertEqual(schema["properties"]["status"]["enum"],
                         ["published", "submitted", "in-progress", "unpublished"])


class Validator(unittest.TestCase):
    schema = check.load_schema()

    def messages(self, info):
        return check.validate(info, self.schema)

    def base(self):
        with open(os.path.join(ROOT, "8Be", "info.json"), encoding="utf-8") as f:
            return json.load(f)

    def test_base_is_valid(self):
        self.assertEqual(self.messages(self.base()), [])

    def test_unknown_status_suggests_the_right_one(self):
        info = dict(self.base(), status="publised")
        [m] = self.messages(info)
        self.assertIn('did you mean "published"', m)

    def test_dataset_doi_with_prefix_says_the_bare_doi(self):
        info = self.base()
        info["datasets"]["tombrello_aa_ang1"] = {"label": "T", "doi": "doi:10.1103/PhysRev.138.B40"}
        [m] = self.messages(info)
        self.assertIn("datasets.tombrello_aa_ang1.doi", m)
        self.assertIn('write the bare DOI, "10.1103/PhysRev.138.B40"', m)

    def test_reference_as_link_is_rejected(self):
        info = dict(self.base(), reference="https://doi.org/10.1103/PhysRevC.111.035802")
        [m] = self.messages(info)
        self.assertIn('"10.1103/PhysRevC.111.035802"', m)

    def test_missing_fields_are_named(self):
        info = self.base()
        del info["purpose_it"]
        [m] = self.messages(info)
        self.assertIn("`purpose_it`", m)

    def test_misspelt_field_is_named(self):
        info = self.base()
        info["purpose_IT"] = info.pop("purpose_it")
        msgs = self.messages(info)
        self.assertTrue(any("did you mean `purpose_it`" in m for m in msgs), msgs)

    def test_split_flag_must_be_boolean(self):
        info = dict(self.base(), split_total_capture="yes")
        [m] = self.messages(info)
        self.assertIn("true or false", m)

    def test_reaction_must_parse(self):
        info = dict(self.base(), reactions=["4He + 4He"])
        [m] = self.messages(info)
        self.assertIn("¹²C(p,γ)¹³N", m)


class BrokenCopies(unittest.TestCase):
    """The reviewer's planted mistakes, each in a fresh copy of the evaluations."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.root = os.path.join(self.tmp, "evaluations")
        shutil.copytree(ROOT, self.root, ignore=shutil.ignore_patterns(
            "fine", "datamodel", "extrap*", "checks", "*.json.tmp", "precomputed.json", "initial*.json",
            "8Be-test"))
        self.atlas = os.path.join(self.tmp, "reactions")
        shutil.copytree(ATLAS, self.atlas)
        shutil.copytree(os.path.join(self.root, "8Be"), os.path.join(self.root, "8Be-test"))
        os.rename(os.path.join(self.root, "8Be-test", "8Be.azr"),
                  os.path.join(self.root, "8Be-test", "8Be-test.azr"))
        info = self.info()
        info["id"] = "8Be-test"
        self.write_info(info)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def info(self):
        with open(os.path.join(self.root, "8Be-test", "info.json"), encoding="utf-8") as f:
            return json.load(f)

    def write_info(self, info):
        with open(os.path.join(self.root, "8Be-test", "info.json"), "w", encoding="utf-8") as f:
            json.dump(info, f, ensure_ascii=False, indent=2)

    def problems(self):
        python = errors(check.check_root(self.root, atlas_dir=self.atlas))
        if NODE and not self.atlas_patched:
            # The site's checker on the same copy (it reads the real atlas,
            # which the copy matches) finds as many errors.
            out = subprocess.run([NODE, os.path.join(REPO, "scripts", "evaluations-check.mjs"),
                                  "--quiet", "--root", self.root],
                                 capture_output=True, text=True, cwd=REPO)
            listed = out.stdout.split("error(s)", 1)[1] if "error(s)" in out.stdout else ""
            node = [line for line in listed.splitlines() if line.startswith("  • ")]
            self.assertEqual(len(node), len(python), out.stdout)
            self.assertEqual(out.returncode, 1 if python else 0, out.stdout)
        return python

    # Set by a test that edits the copied atlas, which only app.check reads.
    atlas_patched = False

    def test_copy_is_valid(self):
        self.assertEqual(self.problems(), [])

    def test_atlas_case_typo_in_yaml(self):
        # Checked against the copied atlas (the node checker reads the real one).
        self.atlas_patched = True
        path = os.path.join(self.atlas, "4He-aa-12C.yaml")
        with open(path, encoding="utf-8") as f:
            text = f.read()
        with open(path, "w", encoding="utf-8") as f:
            f.write(text.replace("rmatrix: [8Be]", "rmatrix: [8Be, 8be-test]"))
        [m] = self.problems()
        self.assertIn('did you mean "8Be-test"', m)

    def test_atlas_typo_in_info(self):
        self.write_info(dict(self.info(), atlas=["4He-aa-12c"]))
        [m] = self.problems()
        self.assertIn('did you mean "4He-aa-12C"', m)

    def test_dataset_stem_typo(self):
        info = self.info()
        info["datasets"]["tombrelo_aa_ang5"] = info["datasets"].pop("tombrello_aa_ang5")
        self.write_info(info)
        msgs = self.problems()
        self.assertEqual(len(msgs), 2)
        self.assertIn('did you mean "tombrello_aa_ang5"', msgs[0])
        self.assertIn('data file "tombrello_aa_ang5" has no label', msgs[1])

    def test_json_syntax_error_names_the_line(self):
        path = os.path.join(self.root, "8Be-test", "info.json")
        with open(path, encoding="utf-8") as f:
            text = f.read()
        with open(path, "w", encoding="utf-8") as f:
            f.write(text.replace('"unpublished",', '"unpublished",,', 1))
        [m] = self.problems()
        self.assertIn("is not valid JSON", m)
        self.assertIn('"unpublished",,', m)

    def test_absolute_paths_in_azr(self):
        path = os.path.join(self.root, "8Be-test", "8Be-test.azr")
        with open(path, encoding="utf-8") as f:
            text = f.read()
        with open(path, "w", encoding="utf-8") as f:
            f.write(text.replace(" data/", " /home/jakub/azure/8Be/data/"))
        msgs = self.problems()
        self.assertEqual(len(msgs), 5)
        self.assertIn('"data/tombrello_aa_ang1.dat"', msgs[0])

    def test_id_must_match_directory(self):
        self.write_info(dict(self.info(), id="8Be"))
        [m] = self.problems()
        self.assertIn("the directory name is the id", m)

    def test_todo_placeholder(self):
        self.write_info(dict(self.info(), purpose="TODO: one plain sentence."))
        [m] = self.problems()
        self.assertIn("still says", m)

    def test_dataset_without_reference_is_an_error(self):
        info = self.info()
        info["datasets"]["tombrello_aa_ang1"] = "Tombrello"
        self.write_info(info)
        [m] = self.problems()
        self.assertIn('dataset "tombrello_aa_ang1" has no reference', m)

    def test_dataset_reference_needs_authors_and_a_year(self):
        info = self.info()
        info["datasets"]["tombrello_aa_ang2"] = {"label": "Tombrello", "ref": "Phys. Rev. 129, 2252", "doi": None}
        self.write_info(info)
        msgs = self.problems()
        self.assertEqual(len(msgs), 2, msgs)
        self.assertIn("has no `authors`", msgs[0])
        self.assertIn("has no year", msgs[1])

    def test_pending_reference_and_missing_doi_are_warnings(self):
        info = self.info()
        info["datasets"]["tombrello_aa_ang3"] = {"label": "Tombrello", "pending": "the analyst is checking which paper"}
        del info["datasets"]["tombrello_aa_ang4"]["doi"]
        self.write_info(info)
        self.assertEqual(self.problems(), [])
        warnings = [p.message for p in check.check_root(self.root, ["8Be-test"], atlas_dir=self.atlas)
                    if p.level == "warning"]
        self.assertTrue(any('"tombrello_aa_ang3": reference pending' in m for m in warnings), warnings)
        self.assertTrue(any('"tombrello_aa_ang4" has no `doi`' in m for m in warnings), warnings)

    def test_missing_timings_is_a_warning(self):
        os.remove(os.path.join(self.root, "8Be-test", "timings.json"))
        problems = check.check_root(self.root, ["8Be-test"], atlas_dir=self.atlas)
        self.assertEqual(errors(problems), [])
        self.assertTrue(any("app.warm" in p.message for p in problems))


class AddEvaluation(unittest.TestCase):
    """scripts/add-evaluation.py on an .azr saved with absolute paths."""

    def setUp(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "add_evaluation", os.path.join(REPO, "scripts", "add-evaluation.py"))
        self.add = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.add)
        self.tmp = tempfile.mkdtemp()
        self.root = os.path.join(self.tmp, "evaluations")
        os.makedirs(self.root)
        # An AZURE2 working directory elsewhere, as the GUI leaves it.
        work = os.path.join(self.tmp, "azure", "8Be")
        os.makedirs(os.path.join(work, "output"))
        self.work = work
        self.measurements = os.path.join(work, "measurements")
        shutil.copytree(os.path.join(ROOT, "8Be", "data"), self.measurements)
        for name in ("intEC.dat", "intEC.extrap"):
            shutil.copy(os.path.join(ROOT, "8Be", "output", name), os.path.join(work, "output"))
        with open(os.path.join(ROOT, "8Be", "8Be.azr"), encoding="utf-8") as f:
            self.original = f.read()
        text = self.original.replace(" data/", f" {self.measurements}/")
        text = text.replace("\noutput/ ", f"\n{work}/output/ ", 1).replace("\nchecks/ ", f"\n{work}/checks/ ", 1)
        text = text.replace('"output/param.sav"', f'"{work}/output/param.sav"')
        self.azr = os.path.join(work, "8Be.azr")
        with open(self.azr, "w", encoding="utf-8") as f:
            f.write(text)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def run_add(self, *args):
        out = io.StringIO()
        old = sys.stdout
        sys.stdout = out
        try:
            status = self.add.main(["8Be-test", self.azr, "--root", self.root, "--no-check", *args])
        finally:
            sys.stdout = old
        return status, out.getvalue()

    def test_paths_are_made_relative_and_files_copied(self):
        status, out = self.run_add()
        self.assertEqual(status, 0)
        dest = os.path.join(self.root, "8Be-test")
        with open(os.path.join(dest, "8Be-test.azr"), encoding="utf-8") as f:
            self.assertEqual(f.read(), self.original)
        self.assertEqual(sorted(os.listdir(os.path.join(dest, "data"))),
                         sorted(os.listdir(os.path.join(ROOT, "8Be", "data"))))
        self.assertTrue(os.path.isfile(os.path.join(dest, "output", "intEC.dat")))
        with open(os.path.join(dest, "info.json"), encoding="utf-8") as f:
            info = json.load(f)
        self.assertEqual(sorted(info["datasets"]), [f"tombrello_aa_ang{i}" for i in range(1, 6)])
        self.assertIn("TODO", info["purpose"])
        # Each dataset's publication is left for them to fill in, never guessed.
        for entry in info["datasets"].values():
            self.assertIn("TODO", entry["ref"])
            self.assertIn("TODO", entry["authors"])
        # Nobody's name is filled in for them: the analyst is a TODO too.
        self.assertIn("TODO", info["analysis"])
        self.assertNotIn("Skowronski", info["analysis"])
        self.assertIn("What is left", out)
        # Every copy is listed, source -> destination.
        self.assertIn(f"{os.path.realpath(self.measurements)}/tombrello_aa_ang1.dat -> data/tombrello_aa_ang1.dat", out)
        self.assertIn("-> output/intEC.dat", out)
        # Only the TODOs (and the missing timings) stand between it and the site.
        problems = check.check_root(self.root, ["8Be-test"], atlas_dir=ATLAS)
        self.assertTrue(errors(problems))
        self.assertTrue(all("still says" in m for m in errors(problems)), errors(problems))

    @unittest.skipUnless(HAVE_PYAZR, "pyazr not importable")
    def test_reactions_are_read_from_the_model(self):
        self.run_add()
        with open(os.path.join(self.root, "8Be-test", "info.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["reactions"], ["⁴He(α,α)⁴He"])

    def test_data_found_through_data_dir_when_moved(self):
        moved = os.path.join(self.tmp, "elsewhere")
        shutil.move(self.measurements, moved)
        with self.assertRaises(self.add.Failure) as caught:
            self.run_add()
        self.assertIn("tombrello_aa_ang1.dat", str(caught.exception))
        self.assertFalse(os.path.exists(os.path.join(self.root, "8Be-test")))
        status, _ = self.run_add("--data", moved)
        self.assertEqual(status, 0)

    # -- r15 security #4: only the model's own files, from its own tree ----------

    def write_azr(self, old, new):
        with open(self.azr, encoding="utf-8") as f:
            text = f.read()
        self.assertIn(old, text)
        with open(self.azr, "w", encoding="utf-8") as f:
            f.write(text.replace(old, new, 1))

    def secret(self):
        """A private file outside the .azr's directory."""
        outside = os.path.join(self.tmp, "home", ".ssh")
        os.makedirs(outside)
        path = os.path.join(outside, "id_rsa.dat")
        with open(path, "w") as f:
            f.write("PRIVATE KEY\n")
        return path

    def assert_refused(self, *args):
        with self.assertRaises(self.add.Failure) as caught:
            self.run_add(*args)
        self.assertIn("outside", str(caught.exception))
        self.assertFalse(os.path.exists(os.path.join(self.root, "8Be-test")))
        return str(caught.exception)

    def test_absolute_path_outside_the_tree_is_refused(self):
        secret = self.secret()
        self.write_azr(f"{self.measurements}/tombrello_aa_ang1.dat", secret)
        self.assertIn(secret, self.assert_refused())

    def test_relative_path_climbing_out_is_refused(self):
        self.secret()
        self.write_azr(f"{self.measurements}/tombrello_aa_ang1.dat", "../../home/.ssh/id_rsa.dat")
        self.assert_refused()

    def test_symlink_pointing_out_is_refused(self):
        secret = self.secret()
        link = os.path.join(self.measurements, "tombrello_aa_ang1.dat")
        os.remove(link)
        os.symlink(secret, link)
        self.assertIn(os.path.realpath(secret), self.assert_refused())

    def test_symlink_inside_the_tree_is_fine(self):
        target = os.path.join(self.work, "real.dat")
        link = os.path.join(self.measurements, "tombrello_aa_ang1.dat")
        shutil.move(link, target)
        os.symlink(target, link)
        status, out = self.run_add()
        self.assertEqual(status, 0)
        self.assertIn(f"{os.path.realpath(target)} -> data/tombrello_aa_ang1.dat", out)

    def test_data_directory_named_on_the_command_line_is_allowed(self):
        moved = os.path.join(self.tmp, "shared-data")
        shutil.move(self.measurements, moved)
        self.write_azr(self.measurements, moved)
        self.assert_refused()
        status, _ = self.run_add("--data", moved)
        self.assertEqual(status, 0)

    def test_output_directory_outside_is_not_copied(self):
        outside = os.path.join(self.tmp, "other-run", "output")
        shutil.move(os.path.join(self.work, "output"), outside)
        self.write_azr(f"\n{self.work}/output/ ", f"\n{outside}/ ")
        status, out = self.run_add()
        self.assertEqual(status, 0)
        self.assertIn("not copying", out)
        self.assertFalse(os.path.exists(os.path.join(self.root, "8Be-test", "output", "intEC.dat")))

    def test_file_not_named_by_the_azr_is_not_copied(self):
        with open(os.path.join(self.measurements, "notes.dat"), "w") as f:
            f.write("not data\n")
        self.run_add()
        self.assertNotIn("notes.dat", os.listdir(os.path.join(self.root, "8Be-test", "data")))

    def test_existing_id_is_refused_unless_forced(self):
        self.run_add()
        with self.assertRaises(self.add.Failure) as caught:
            self.run_add()
        self.assertIn("already exists", str(caught.exception))
        info = os.path.join(self.root, "8Be-test", "info.json")
        with open(info, "w", encoding="utf-8") as f:
            f.write('{"kept": true}')
        self.run_add("--force")
        with open(info, encoding="utf-8") as f:
            self.assertEqual(json.load(f), {"kept": True})

    def test_bad_id_is_refused(self):
        with self.assertRaises(self.add.Failure):
            self.add.main(["8 Be", self.azr, "--root", self.root, "--no-check"])

    def test_atlas_id(self):
        self.assertEqual(self.add.atlas_id("¹²C(p,γ)¹³N"), "12C-pg-13N")
        self.assertEqual(self.add.atlas_id("³He(α,γ)⁷Be"), "3He-ag-7Be")


class Warm(unittest.TestCase):
    def test_page_timings_use_the_page_names(self):
        out = warm.page_timings({"open": 0.3, "prepare": {"data": 0.1, "fine": 0.4},
                                 "edit": 0.02, "extrap": 0.01, "measured": "2026-10-13"})
        self.assertEqual(out, {"open": 0.3, "prepare_data": 0.1, "prepare_fine": 0.4,
                               "edit": 0.02, "extrap_edit": 0.01, "measured": "2026-10-13"})

    def test_summary_fails_when_one_failed(self):
        out = io.StringIO()
        self.assertEqual(warm.summary({"8Be": None, "12C": "EngineError: no"}, out), 1)
        self.assertIn("FAILED", out.getvalue())
        self.assertEqual(warm.summary({"8Be": None}, io.StringIO()), 0)

    def test_unknown_id_is_a_failure(self):
        tmp = tempfile.mkdtemp()
        try:
            results = warm.warm(tmp, out=io.StringIO(), only={"nope"})
        finally:
            shutil.rmtree(tmp)
        self.assertIsNotNone(results["nope"])

    def test_write_timings_keeps_the_browser_part(self):
        tmp = tempfile.mkdtemp()
        try:
            with open(os.path.join(tmp, "timings.json"), "w") as f:
                json.dump({"browser": {"open": 6}}, f)

            class E:
                path = tmp
            warm.write_timings(E, {"open": 0.4, "extrap": 0.1})
            with open(os.path.join(tmp, "timings.json")) as f:
                stored = json.load(f)
        finally:
            shutil.rmtree(tmp)
        self.assertEqual(stored, {"browser": {"open": 6}, "server": {"open": 0.4, "extrap_edit": 0.1}})


if __name__ == "__main__":
    unittest.main()

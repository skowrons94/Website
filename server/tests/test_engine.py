"""The engine's calculations: one AZURE2 pass for every result, and the
extrapolations' collapsed angles."""

import os
import re
import shutil

import numpy as np
import pytest

from app import fine

HERE = os.path.dirname(os.path.abspath(__file__))
EVALUATIONS = os.path.join(HERE, "..", "evaluations")


def _copy(name, tmp_path, tests=None):
    target = tmp_path / name
    shutil.copytree(os.path.join(EVALUATIONS, name), target,
                    ignore=shutil.ignore_patterns("fine", "extrap", "extrapolations",
                                                  "datamodel", "precomputed.json"))
    os.makedirs(target / "checks", exist_ok=True)
    os.makedirs(target / "output", exist_ok=True)
    if tests is not None:
        azr = target / f"{name}.azr"
        text = azr.read_text()
        text = re.sub(r"<segmentsTest>.*?</segmentsTest>",
                      lambda _: "<segmentsTest>\n" + "\n".join(tests) + "\n</segmentsTest>",
                      text, flags=re.S)
        azr.write_text(text)
        # No integrals of another grid.
        for stale in ("intEC.extrap",):
            try:
                os.remove(target / "output" / stale)
            except OSError:
                pass
    return str(target)


def test_extrapolation_model_takes_the_data_vector(tmp_path):
    """engine.evaluate on a model in extrapolation mode, given the session's
    data-mode vector (R-matrix parameters, then the segments' norms): the
    same as with the model's own, shorter vector -- AZURE2 since bc3bd57
    refuses a vector of the wrong length, so the engine cuts it.  A vector
    that is not the data model's is still refused."""
    pyazr = pytest.importorskip("pyazr")
    from app.engine import evaluate

    directory = _copy("17F", tmp_path)
    path = os.path.join(directory, "17F.azr")
    data = pyazr.azure2(path, cwd=directory)
    params = np.asarray(data.params, dtype=np.float64) * 1.001
    data.close()
    extrap = pyazr.azure2(path, cwd=directory, data_mode=False)
    try:
        own = np.asarray(extrap.params, dtype=np.float64)
        assert len(own) < len(params)
        cut = evaluate(extrap, params, grid=False)
        mine = evaluate(extrap, params[:len(own)], grid=False)
        for a, b in zip(cut[0], mine[0]):
            np.testing.assert_array_equal(a, b)
        with pytest.raises(ValueError):
            evaluate(extrap, params[:len(own) - 1], grid=False)
    finally:
        extrap.close()


@pytest.mark.parametrize("data_mode", [True, False])
def test_single_pass_equals_the_four_calls(tmp_path, data_mode):
    """engine.evaluate: one update_segments, the same numbers as pyazr's
    calculate, calculate_sfactor, calculate_energies and calculate_angles
    (each of which runs its own)."""
    pyazr = pytest.importorskip("pyazr")
    from app.engine import evaluate

    directory = _copy("13N", tmp_path)
    azr = pyazr.azure2(os.path.join(directory, "13N.azr"), cwd=directory, data_mode=data_mode)
    try:
        params = np.asarray(azr.params, dtype=np.float64) * 1.001
        mu, sfactor, energies, angles = evaluate(azr, params)
        for got, expected in ((mu, azr.calculate(params)),
                              (sfactor, azr.calculate_sfactor(params)),
                              (energies, azr.calculate_energies(params)),
                              (angles, azr.calculate_angles(params))):
            assert len(got) == len(expected)
            for a, b in zip(got, expected):
                np.testing.assert_allclose(a, np.asarray(b, dtype=float), rtol=1e-12, equal_nan=True)
    finally:
        azr.close()


def test_collapsed_angles_are_lossless(tmp_path):
    """⁷Be: an angle-integrated extrapolation declared over 0-180° (181
    identical copies per energy) calculated at one angle gives the same
    numbers at every energy; a differential line is left alone."""
    pyazr = pytest.importorskip("pyazr")
    from app import engine

    tests = [
        "1 2 1 0.3 0.9 0.2 0 180 45 0 0",          # 6Li(p,a), angle-integrated, 5 angles
        "1 1 4 0.4 0.8 0.2 0 90 30 0 0",           # 3He(a,g0), angle-integrated, 4 angles
        "1 2 2 0.5 0.9 0.2 90 90 0 5 0",           # 6Li(p,p) at 90 deg, untouched
    ]
    directory = _copy("7Be", tmp_path, tests)
    azr_path = os.path.join(directory, "7Be.azr")
    original = pyazr.azure2(azr_path, cwd=directory, data_mode=False)
    try:
        params = np.asarray(original.params, dtype=np.float64)
        mu, sfactor, energies, _ = engine.evaluate(original, params)
    finally:
        original.close()

    assert fine.extrap_needs_model(azr_path, [], False)
    state = {}
    try:
        e2, a2, mu2, s2 = engine.extrap_curves(state, azr_path, directory, params)
    finally:
        if state.get("model") is not None:
            state["model"].close()
    lines = [l.split() for l in re.search(r"<segmentsTest>\n(.*?)</segmentsTest>",
             open(os.path.join(directory, engine.EXTRAP_DIR, "extrap.azr")).read(), re.S).group(1).splitlines() if l.strip()]
    assert [t[7] for t in lines] == ["0", "0", "90"]
    assert len(e2) == 3
    for k in range(3):
        # Every original point has its value in the collapsed result.
        at = {round(float(e), 9): (m, s) for e, m, s in zip(e2[k], mu2[k], s2[k])}
        assert len(at) == len(e2[k]) or k == 2
        for e, m, s in zip(energies[k], mu[k], sfactor[k]):
            m2, s2_ = at[round(float(e), 9)]
            assert m2 == pytest.approx(m, rel=1e-9)
            assert s2_ == pytest.approx(s, rel=1e-9)
        if k < 2:
            assert len(energies[k]) > len(e2[k])


def test_models_of_one_process_stay_apart(tmp_path):
    """AZURE2 keeps state across the models of one process: the split data
    model calculated after the fine model was built came out wrong (⁷Be's
    total capture by 25x).  engine.evaluate initializes a model again when
    another came after it, so the order no longer matters."""
    pytest.importorskip("pyazr")
    import pyazr
    from app import engine

    directory = _copy("17F", tmp_path)
    azr_path = os.path.join(directory, "17F.azr")
    azr = engine.opened(pyazr.azure2(azr_path, cwd=directory))
    fine_state = {}
    try:
        params = np.asarray(azr.params, dtype=np.float64) * 1.01
        first = engine._dispatch(azr, "data", params)
        before = engine.fine_curves(fine_state, azr_path, directory, params)
        again = engine._dispatch(azr, "data", params)
        after = engine.fine_curves(fine_state, azr_path, directory, params)
        for a, b in zip(first[1], again[1]):
            np.testing.assert_allclose(a, b, rtol=1e-5)
        for a, b in zip(before[3], after[3]):
            np.testing.assert_allclose(a, b, rtol=1e-5)
    finally:
        for model in (fine_state.get("model"), getattr(azr, "_data_state", {}).get("model"), azr):
            if model is not None:
                model.close()

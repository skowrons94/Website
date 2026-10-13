"""Fill the results cache for every evaluation (see ``app.cache``), write its
``initial.json`` (``app.initial``) and measure its typical timings.

    python -m app.warm            # from server/, or in the container:
    make warm                     # docker compose exec azure2 python3 -m app.warm
    python -m app.warm --force 7Be   # measure again (only 7Be)

Run it after a deploy or after editing an evaluation, so that even the first
visitor gets the data and extrapolation curves, the model on a fine grid
(``app.fine``) and the level scheme at once -- the scheme before the session
has even started.  Evaluations whose cache and initial payload are already
valid are skipped.  One model is open at a time, so the memory needed is that
of the largest evaluation alone.

The timings (``initial.json`` → ``timings``) are measured in a second,
fresh session once the cache is full, as a visitor meets them: open, the
background preparation of each derived model, an edit once prepared, the
extrapolations after it (and an energy × angle grid, where there is one).
They depend on the machine and on what else runs; run this when the server
is quiet.  They are also written to the evaluation's ``timings.json``
(:func:`write_timings`), which is committed with it: the site ships those as
the estimate it shows before the server answers ("opens in about N s"), so
they are never typed by hand.

It ends with one line per evaluation (ok / failed) and exits with status 1
when any failed, so a script or a person running it cannot miss a failure.
"""

import argparse
import datetime
import json
import logging
import os
import sys
import time

from app import cache
from app import evaluations as evaluations_module
from app import initial as initial_module
from app.engine import PREPARE_STEPS
from app.session import Session
from config import Config

KEYS = ("data", "fine", "extrap", "grid")
METHODS = {"data": "calculate_data", "fine": "calculate_fine",
           "extrap": "calculate_extrapolations", "grid": "calculate_grid"}


def _session(evaluation):
    return Session("warm", evaluation,
                   omp_threads=Config.OMP_THREADS,
                   prepare_threads=Config.PREPARE_THREADS,
                   timeout=Config.CALL_TIMEOUT)


def _edit_index(session):
    """A free parameter to edit for the timing: the first particle width."""
    for level in session.scheme.levels:
        for channel in level.channels:
            if channel.free_index is not None and not channel.is_photon and channel.width:
                return channel.free_index
    return 0


def has_grid(azr_path):
    """Does the evaluation have an energy × angle extrapolation grid?"""
    from app import fine
    try:
        with open(azr_path) as f:
            tests = fine._active_tests(f.read()) or []
    except OSError:
        return False
    return any(fine.is_grid(t) for t in tests)


def fill(evaluation, out):
    """Every cache entry at the shipped parameters."""
    session = _session(evaluation)
    try:
        params = list(session.initial_params)
        grid = has_grid(evaluation.azr_path)
        for key in KEYS:
            if key == "grid" and not grid:
                continue
            if cache.read(evaluation.path, params, key, unedited=True) is not None:
                print(f"{evaluation.id:6s} {key:6s} cached", file=out, flush=True)
                continue
            t = time.time()
            getattr(session, METHODS[key])(params)
            print(f"{evaluation.id:6s} {key:6s} {time.time() - t:6.1f} s", file=out, flush=True)
    finally:
        session.close()


def measure(evaluation, out):
    """Typical timings, in a fresh session (seconds, 2 significant digits)."""
    timings = {"prepare": {}}
    t = time.time()
    session = _session(evaluation)
    timings["open"] = time.time() - t
    try:
        for step in PREPARE_STEPS:
            t = time.time()
            session.prepare(step)
            timings["prepare"][step] = time.time() - t
        index = _edit_index(session)
        session.set_parameters({index: session.params[index] * 1.01})
        params = session.snapshot()
        t = time.time()
        session.calculate_data(params)
        session.calculate_fine(params)
        timings["edit"] = time.time() - t
        t = time.time()
        session.calculate_extrapolations(params)
        timings["extrap"] = time.time() - t
        if has_grid(evaluation.azr_path):
            t = time.time()
            session.calculate_grid(params)
            timings["grid"] = time.time() - t
    finally:
        session.close()

    def r(v):
        return float(f"{v:.2g}") if isinstance(v, float) else {k: r(x) for k, x in v.items()}
    timings = {k: r(v) for k, v in timings.items()}
    timings.update({
        "source": "server",
        "omp_threads": Config.OMP_THREADS,
        "prepare_threads": Config.PREPARE_THREADS,
        "cpus": os.cpu_count(),
        "measured": datetime.date.today().isoformat(),
    })
    print(f"{evaluation.id:6s} timings {timings}", file=out, flush=True)
    return timings


def write_initial(evaluation, timings, out):
    session = _session(evaluation)
    try:
        payload = initial_module.build(session, evaluation.labels, timings)
        extrap = initial_module.build_extrapolations(session, evaluation.labels)
    finally:
        session.close()
    initial_module.write(evaluation.path, payload)
    if extrap is not None:
        initial_module.write(evaluation.path, extrap, initial_module.EXTRAP_FILE)
    print(f"{evaluation.id:6s} initial.json "
          f"({', '.join(p for p in initial_module.PARTS if p in payload)})", file=out, flush=True)


TIMINGS_FILE = "timings.json"


def page_timings(measured):
    """The measured timings under the names the page uses (lib/api.ts
    ``Timings``): ``prepare.data`` -> ``prepare_data``, ``extrap`` (after an
    edit) -> ``extrap_edit``; the bookkeeping fields are kept as they are."""
    out = {}
    for key, value in (measured or {}).items():
        if key == "prepare" and isinstance(value, dict):
            out.update({f"prepare_{step}": v for step, v in value.items()})
        elif key == "extrap":
            out["extrap_edit"] = value
        else:
            out[key] = value
    return out


def write_timings(evaluation, measured, side="server"):
    """Store ``measured`` as the ``side`` part of the evaluation's
    ``timings.json``, keeping the other part (the browser's, measured in a
    browser: docs/ADDING-AN-EVALUATION.md)."""
    path = os.path.join(evaluation.path, TIMINGS_FILE)
    try:
        with open(path, encoding="utf-8") as f:
            stored = json.load(f)
        if not isinstance(stored, dict):
            stored = {}
    except (OSError, ValueError):
        stored = {}
    stored[side] = page_timings(measured)
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(stored, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def warm(root, out=sys.stdout, only=None, force=False, timings=True):
    """Warm every evaluation (or those in ``only``); returns {id: error or None}."""
    results = {}
    only = set(only or ())
    found = evaluations_module.discover(root)
    for missing in sorted(only - {e.id for e in found}):
        results[missing] = "no such evaluation (or AZURE2 cannot read its .azr)"
    for evaluation in found:
        if only and evaluation.id not in only:
            continue
        try:
            fill(evaluation, out)
            stored = initial_module.read(evaluation.path)
            if not force and stored is not None and all(p in stored for p in initial_module.PARTS) \
                    and (stored.get("timings") or not timings) \
                    and initial_module.has_extrapolations(evaluation.path):
                print(f"{evaluation.id:6s} initial.json valid", file=out, flush=True)
                if stored.get("timings") and not os.path.isfile(
                        os.path.join(evaluation.path, TIMINGS_FILE)):
                    write_timings(evaluation, stored["timings"])
                results[evaluation.id] = None
                continue
            measured = measure(evaluation, out) if timings else (stored or {}).get("timings")
            write_initial(evaluation, measured, out)
            if timings and measured:
                write_timings(evaluation, measured)
            results[evaluation.id] = None
        except Exception as err:            # one bad model must not stop the rest
            results[evaluation.id] = f"{type(err).__name__}: {err}"
            print(f"{evaluation.id:6s} failed: {results[evaluation.id]}", file=out, flush=True)
    return results


def summary(results, out=sys.stdout):
    """One line per evaluation; the exit status (1 when any failed)."""
    print("\nsummary:", file=out)
    for eid, err in results.items():
        print(f"  {eid:8s} {'ok' if err is None else 'FAILED  ' + err}", file=out)
    failed = [eid for eid, err in results.items() if err is not None]
    if failed:
        print(f"\n{len(failed)} of {len(results)} failed ({', '.join(failed)}). "
              f"`python -m app.check {' '.join(failed)}` says what is wrong with the files.",
              file=out)
        return 1
    if not results:
        print("  (no evaluations)", file=out)
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("only", nargs="*", help="evaluation ids (default: all)")
    parser.add_argument("--force", action="store_true", help="measure the timings again")
    parser.add_argument("--no-timings", action="store_true", help="skip the timing session")
    parser.add_argument("--root", default=Config.EVALUATIONS_DIR)
    a = parser.parse_args()
    sys.exit(summary(warm(a.root, only=set(a.only), force=a.force,
                          timings=not a.no_timings)))

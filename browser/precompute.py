"""Prepare the evaluations for the static site.

Run natively (with the server's pyazr installed) from the repository root:

    python browser/precompute.py server/evaluations build/azure2/evaluations

Each evaluation is copied to the destination and warmed exactly as the server
warms its own (``server/app/warm.py``): the data, smooth-curve, extrapolation
and energy × angle grid results at its shipped parameters are stored next to it
as ``precomputed.json`` (read by ``bridge.py`` through ``app.cache``), and the
scheme, data and smooth curves the page draws before Python has even started as
``initial.json`` (``app.initial``; with the server's typical timings, copied
from the source evaluation).  Building the derived models also leaves AZURE2's
external-capture integrals next to them, so a visitor who edits a level does
not pay for them again.

The evaluation list the page shows is written as ``index.json``, by the
server's own ``discover``, so it matches what the API returns.
"""

import argparse
import json
import os
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "server"))
sys.path.insert(0, HERE)

from app import evaluations as evaluations_module  # noqa: E402
from app import initial as initial_module  # noqa: E402
from app import warm  # noqa: E402

# Never shipped: AZURE2's check files (47 MB for ¹⁴N), lock and temporary files,
# and ``extrap/``, where an older server kept its extrapolation model.
IGNORE = shutil.ignore_patterns("checks", "__pycache__", ".precomputed-*", ".lock",
                                ".fine-*", ".initial-*", ".probe", "extrap")


def main(source, destination, timings=False):
    os.makedirs(destination, exist_ok=True)
    found = evaluations_module.discover(source)
    for evaluation in found:
        target = os.path.join(destination, evaluation.id)
        if os.path.exists(target):
            shutil.rmtree(target)
        shutil.copytree(evaluation.path, target, ignore=IGNORE)
        os.makedirs(os.path.join(target, "checks"), exist_ok=True)

        t = time.time()
        copy = evaluations_module.get(destination, evaluation.id)
        # The server's own warm-up, in the copy: every cache entry at the
        # shipped parameters (data, smooth curves, extrapolations, energy ×
        # angle grids), calculated by the same worker processes the server
        # uses, which also leave the derived models' external-capture
        # integrals next to them for the page.
        warm.fill(copy, sys.stdout)
        stored = initial_module.read(evaluation.path) or {}
        measured = warm.measure(copy, sys.stdout) if timings else stored.get("timings")
        warm.write_initial(copy, measured, sys.stdout)
        print(f"{evaluation.id}: {time.time() - t:.1f} s", flush=True)

    with open(os.path.join(destination, "index.json"), "w") as f:
        json.dump([e.to_dict() for e in evaluations_module.discover(destination)], f)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("destination")
    ap.add_argument("--timings", action="store_true",
                    help="measure the server timings again (else copied from the source's initial.json)")
    a = ap.parse_args()
    main(a.source, a.destination, a.timings)

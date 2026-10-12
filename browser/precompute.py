"""Prepare the evaluations for the static site.

Run natively (with the server's pyazr installed) from the repository root:

    python browser/precompute.py server/evaluations build/azure2/evaluations

Each evaluation is copied to the destination, opened with AZURE2, and the data
and extrapolation curves at its shipped parameters are stored next to it as
``precomputed.json`` (read by ``bridge.py``).  Running the extrapolations also
leaves AZURE2's external-capture integrals cached in ``output/``, so a visitor
who edits a level does not pay for them again.

The evaluation list the page shows is written as ``index.json``, by the
server's own ``discover``, so it matches what the API returns.
"""

import json
import os
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "server"))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

from app import evaluations as evaluations_module  # noqa: E402
from app.engine import _dispatch, fine_curves  # noqa: E402
from app import cache  # noqa: E402


def main(source, destination):
    import pyazr

    os.makedirs(destination, exist_ok=True)
    found = evaluations_module.discover(source)
    for evaluation in found:
        target = os.path.join(destination, evaluation.id)
        if os.path.exists(target):
            shutil.rmtree(target)
        shutil.copytree(evaluation.path, target,
                        ignore=shutil.ignore_patterns("checks", "__pycache__", ".precomputed-*", ".lock", ".fine-*"))
        os.makedirs(os.path.join(target, "checks"), exist_ok=True)

        t = time.time()
        azr = pyazr.azure2(os.path.join(target, evaluation.azr_filename), cwd=target)
        params = np.asarray(azr.params, dtype=np.float64)
        data = _dispatch(azr, "data", params)
        extrap = _dispatch(azr, "extrap", params)
        azr.close()
        cache.write(target, params, "data", data)
        cache.write(target, params, "extrap", extrap)
        # The model on a fine grid per data segment (app/fine.py); this also
        # leaves its external-capture integrals in fine/output/ for the page.
        state = {}
        cache.write(target, params, "fine",
                    fine_curves(state, os.path.join(target, evaluation.azr_filename), target, params))
        if state.get("model") is not None:
            state["model"].close()
        print(f"{evaluation.id}: {time.time() - t:.1f} s", flush=True)

    with open(os.path.join(destination, "index.json"), "w") as f:
        json.dump([e.to_dict() for e in evaluations_module.discover(destination)], f)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

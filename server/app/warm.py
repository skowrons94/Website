"""Fill the results cache for every evaluation (see ``app.cache``).

    python -m app.warm            # from server/, or in the container:
    make warm                     # docker compose exec azure2 python3 -m app.warm

Run it after a deploy or after editing an evaluation, so that even the first
visitor gets the data and extrapolation curves at once.  Evaluations whose cache
is already valid are skipped.  One model is open at a time, so the memory needed
is that of the largest evaluation alone.
"""

import logging
import os
import sys
import time

import numpy as np

from app import cache
from app import evaluations as evaluations_module
from app.engine import Engine
from config import Config


def warm(root, out=sys.stdout):
    for evaluation in evaluations_module.discover(root):
        engine = None
        try:
            engine = Engine(evaluation.azr_path, evaluation.path,
                            # Offline, so it may use every core.
                            omp_threads=os.cpu_count(),
                            timeout=Config.CALL_TIMEOUT)
            params = np.asarray(engine.info.params, dtype=np.float64)
            for key, method in (("data", engine.calculate_data),
                                ("extrap", engine.calculate_extrapolations)):
                if cache.read(evaluation.path, params, key) is not None:
                    print(f"{evaluation.id:6s} {key:6s} cached", file=out, flush=True)
                    continue
                t = time.time()
                cache.write(evaluation.path, params, key, method(params))
                print(f"{evaluation.id:6s} {key:6s} {time.time() - t:6.1f} s", file=out, flush=True)
        except Exception as err:            # one bad model must not stop the rest
            print(f"{evaluation.id:6s} failed: {err}", file=out, flush=True)
        finally:
            if engine is not None:
                engine.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    warm(Config.EVALUATIONS_DIR)

#!/usr/bin/env python3
"""
pynucastro's own answers for every network and scenario of the rates
explorer, stored for `npm run test:rates` (scripts/rates/test.mjs), which
checks the browser's rates and solver against them.

    python scripts/rates/reference.py [network ids...]

For each network: λ(T9) of every reaction from pynucastro's Rate.eval on a
grid of temperatures, and for each scenario the abundances after the burn,
integrated by pynucastro's generated Python network (PythonNetwork, screen5
screening) with scipy's BDF at tight tolerances. Writes
scripts/rates/reference/<id>.json.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
from scipy.integrate import solve_ivp

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import pyna_export as px  # noqa: E402

ROOT = HERE.parents[1]
OUT = HERE / "reference"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def integrate(mod, Y0, T, rho, tmax, until=None, rtol=1e-10, atol=1e-30, screening=True):
    from pynucastro.screening import screen5
    screen = screen5 if screening else None
    events = None
    if until is not None:
        idx, target = until

        def ev(t, Y, *args):
            return Y[idx] - target
        ev.terminal = True
        ev.direction = -1
        events = [ev]
    sol = solve_ivp(mod.rhs, [0, tmax], Y0, method="BDF", jac=mod.jacobian, dense_output=False,
                    events=events, args=(rho, T, screen), rtol=rtol, atol=atol)
    if not sol.success:
        raise RuntimeError(sol.message)
    return sol.t[-1], sol.y[:, -1], sol


def reference_for(data: dict, rates, spec_id: str) -> dict:
    nucs = [n["name"] for n in data["nuclei"]]
    A = np.array([n["A"] for n in data["nuclei"]], dtype=float)
    # rates on a temperature grid, unscreened
    grid = [float(x) for x in np.geomspace(0.005, 5.0, 25)]
    lam = {r.fname: [float(r.eval(T * 1e9)) if len(r.reactants) else 0.0 for T in grid] for r in rates}

    net = px.python_network(rates)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"net_{spec_id}.py"
        net.write_network(str(path))
        mod = load_module(path, f"net_{spec_id}")
        runs = []
        for s in data["scenarios"]:
            Y0 = np.array([s["X"][n] for n in nucs]) / A
            until = None
            if s.get("until"):
                i = nucs.index(s["until"]["nucleus"])
                until = (i, Y0[i] * s["until"]["fraction"])
            t0 = time.time()
            tf, Y, sol = integrate(mod, Y0, s["T9"] * 1e9, s["rho"], s["time_s"], until)
            print(f"  {spec_id} {s['id']}: t = {tf:.4g} s, {sol.nfev} rhs, {time.time() - t0:.1f} s")
            runs.append({"scenario": s["id"], "tFinal": float(tf), "Y": [float(y) for y in Y]})
            # one run without screening, to check that switch too
            if s is data["scenarios"][0]:
                tf2, Y2, _ = integrate(mod, Y0, s["T9"] * 1e9, s["rho"], s["time_s"], until, screening=False)
                runs.append({"scenario": s["id"], "screening": False, "tFinal": float(tf2),
                             "Y": [float(y) for y in Y2]})
    return {"network": data["id"], "nuclei": nucs, "T9": grid, "lambda": lam, "runs": runs,
            "tool": data["provenance"]["tool"], "solver": "scipy solve_ivp BDF, rtol 1e-10, atol 1e-30"}


def main() -> None:
    import build
    only = set(sys.argv[1:])
    specs, scenarios = build.load_specs()
    OUT.mkdir(exist_ok=True)
    for spec in specs:
        if only and spec["id"] not in only:
            continue
        data = json.loads((ROOT / "public" / "rates" / f"{spec['id']}.json").read_text(encoding="utf-8"))
        _, rates = px.network_rates(spec["nuclei"], spec.get("select", "all"), spec.get("include", ()),
                                    spec.get("exclude", ()))
        assert [r.fname for r in rates] == [r["id"] for r in data["reactions"]], "rebuild the JSON first"
        ref = reference_for(data, rates, spec["id"])
        (OUT / f"{spec['id']}.json").write_text(json.dumps(ref, separators=(",", ":")), encoding="utf-8")
    if (HERE / "sprocess.py").exists() and (not only or "sprocess" in only):
        import sprocess
        sprocess.reference(OUT)


if __name__ == "__main__":
    main()

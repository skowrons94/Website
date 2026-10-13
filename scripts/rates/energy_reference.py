#!/usr/bin/env python3
"""
pynucastro's energy generation rate at the states of
scripts/rates/reference/energy/states.json (node scripts/rates/energy-states.mjs:
every scenario at t = 0 and mid-burn), for `npm run test:rates`, which checks
the browser's ε (lib/rates/energy.ts) against it to 1e-6.

    node scripts/rates/energy-states.mjs
    python scripts/rates/energy_reference.py

pynucastro's RateCollection.evaluate_energy_generation (screen5 screening)
gives ε = −N_A Σ Ẏ m c²: neutrino losses are subtracted only for its
tabulated weak rates, so for these REACLIB networks it is the gross rate, and
the browser's ε + ε_ν is what it is compared with. Writes
scripts/rates/reference/energy/energy.json.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import pyna_export as px  # noqa: E402
import pynucastro as pyna  # noqa: E402
from pynucastro.rates.rate import ThermoState  # noqa: E402
from pynucastro.screening import screen5  # noqa: E402

ROOT = HERE.parents[1]
REF = HERE / "reference"


def main() -> None:
    import build
    states = json.loads((REF / "energy" / "states.json").read_text(encoding="utf-8"))
    specs, _ = build.load_specs()
    out = {}
    for spec in specs:
        sid = spec["id"]
        if sid not in states:
            continue
        data = json.loads((ROOT / "public" / "rates" / f"{sid}.json").read_text(encoding="utf-8"))
        _, rates = px.spec_rates(spec)
        assert [r.fname for r in rates] == [r["id"] for r in data["reactions"]], "rebuild the JSON first"
        rc = pyna.RateCollection(rates=rates)
        byname = {n.raw: n for n in rc.unique_nuclei}
        names = [n["name"] for n in data["nuclei"]]
        rows = []
        for st in states[sid]:
            comp = pyna.Composition(rc.unique_nuclei)
            for name, y, n in zip(names, st["Y"], data["nuclei"]):
                comp.X[byname[name]] = y * n["A"]
            state = ThermoState(rho=st["rho"], T=st["T9"] * 1e9, comp=comp)
            eps = rc.evaluate_energy_generation(state, screen_func=screen5)
            rows.append({**st, "eps": float(eps)})
            print(f"  {sid} {st['scenario']} t = {st['t']:.4g} s: ε = {eps:.6e} erg/g/s")
        out[sid] = rows
    (REF / "energy" / "energy.json").write_text(json.dumps({"tool": f"pynucastro {pyna.__version__}",
                                                 "method": "RateCollection.evaluate_energy_generation, screen5",
                                                 "networks": out}, separators=(",", ":")), encoding="utf-8")
    # energy.json holds the states too: the intermediate file goes
    (REF / "energy" / "states.json").unlink()


if __name__ == "__main__":
    main()

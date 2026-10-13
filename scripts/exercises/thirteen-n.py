#!/usr/bin/env python3
"""
Repeat the AZURE2 numbers of exercise 3 on /learn/exercises (THIRTEEN_N in
lib/exercises.ts) against a running evaluations API.

    python3 scripts/exercises/thirteen-n.py http://localhost:5001

Opens a session on the 13N evaluation, reads the χ² and the S-factor at the
shipped parameters, sets the proton width of the 1/2+ level at 2.3682 MeV
(free parameter 2) to 40 keV, reads them again, then moves the level energy
(free parameter 1) by +5 keV instead, and closes the session. Prints what
THIRTEEN_N should hold. Standard library only.
"""

import json
import sys
import urllib.request

API = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5001").rstrip("/") + "/api"


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.load(r)


def chi2(segments, files=None):
    tot = n = 0
    for s in segments:
        if not s["active"] or s.get("chi2_sum") is None:
            continue
        if files and s["data_file"] not in files:
            continue
        tot += s["chi2_sum"]
        n += s["chi2_points"] or 0
    return round(tot), n


def interp(E, S, e):
    for i in range(len(E) - 1):
        if E[i] <= e <= E[i + 1]:
            t = (e - E[i]) / (E[i + 1] - E[i])
            return S[i] + t * (S[i + 1] - S[i])
    return float("nan")


def summary(sid, answer):
    data = answer["data"]
    # The smooth curves come with the answer once their model is ready; else ask for them.
    fine = answer.get("fine") or call("GET", f"/sessions/{sid}/fine")
    capture = next(c for c in fine["curves"] if c.get("calculated_sfactor") and max(c["calculated_sfactor"]) < 1)
    E, S = capture["sfactor_energies"], capture["calculated_sfactor"]
    k = max(range(len(S)), key=lambda i: S[i])
    half = S[k] / 2
    lo = next(E[i] for i in range(k, -1, -1) if S[i] < half)
    hi = next(E[i] for i in range(k, len(S)) if S[i] < half)
    ex = call("GET", f"/sessions/{sid}/extrapolations")[0]
    return {
        "chi2_all": chi2(data),
        "chi2_luna_hpge": chi2(data, {"data/skowronski_luna_hpge.dat"}),
        "S_peak_keVb": round(S[k] * 1e3, 1),
        "fwhm_keV": round((hi - lo) * 1e3, 1),
        "S_24keV_keVb": round(interp(ex["energies"], ex["calculated_sfactor"], 0.024) * 1e3, 3),
        "S_600keV_keVb": round(interp(E, S, 0.6) * 1e3, 2),
    }


opened = call("POST", "/evaluations/13N/open")
sid = opened["session_id"]
try:
    level = next(l for l in opened["scheme"]["levels"] if l["jpi"] == "1/2+" and abs(l["energy"] - 2.3682) < 1e-3)
    width = next(c for c in level["channels"] if c["label"] == "p")
    assert level["energy_free_index"] == 1 and width["free_index"] == 2, "the free parameters moved: update lib/exercises.ts"
    print("level", level["energy"], "MeV, Γp", width["width"], "eV")
    print("published   ", json.dumps(summary(sid, call("POST", f"/sessions/{sid}/reset", {}))))
    print("Γp = 40 keV ", json.dumps(summary(sid, call("POST", f"/sessions/{sid}/parameters", {"updates": {"2": 40000}}))))
    call("POST", f"/sessions/{sid}/reset", {})
    shifted = call("POST", f"/sessions/{sid}/parameters", {"updates": {"1": level["energy"] + 0.005}})
    print("E_x + 5 keV ", json.dumps({"chi2_all": chi2(shifted["data"])}))
finally:
    call("DELETE", f"/sessions/{sid}")

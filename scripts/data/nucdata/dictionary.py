"""The EXFOR dictionary, reduced to what the pipeline decodes.

Source: IAEA-NDS/exfor_dictionary (MIT licence), `latest.json` at the commit
pinned in sources.json.  `python scripts/data/dx.py dictionary <latest.json>`
rewrites the vendored subset (scripts/data/vendor/exfor-dictionary-subset.json),
which is what the build reads, so a build needs neither the repository nor
the network for it.

Sections kept (DICTION numbers): 3 institutes, 5 journals, 16 status,
18 facilities, 21 methods, 22 detectors, 24 data headings, 25 data units,
34 SF8 modifiers, 236 quantities (SF5-SF8).
"""

import json
from functools import lru_cache

from . import config

SECTIONS = {
    "3": "institutes", "5": "journals", "16": "status", "18": "facilities",
    "21": "methods", "22": "detectors", "24": "headings", "25": "units",
    "34": "modifiers", "236": "quantities",
}


def build_subset(latest_path: str, commit: str) -> dict:
    with open(latest_path) as f:
        full = json.load(f)["dictionaries"]
    out = {"source": {"repo": config.sources()["exfor_dictionary"]["repo"], "commit": commit,
                      "license": "MIT, Copyright (c) 2023 Nuclear Data Section (IAEA)"}}
    for num, name in SECTIONS.items():
        codes = {}
        for code, v in full[num]["codes"].items():
            if not v.get("active", True) and num not in ("3", "236"):
                continue
            d = (v.get("description") or "").strip()
            if num == "25":
                codes[code] = [d, v.get("additional_code", ""), v.get("unit_conversion_factor", "")]
            elif num == "236":
                codes[code] = [d.strip("()"), (v.get("additional_code") or "").strip()]
            elif num == "3":
                # A leading short-name token ("LINFN Laboratori ...") is kept as is.
                codes[code] = d
            else:
                codes[code] = d
        out[name] = codes
    return out


@lru_cache(maxsize=1)
def load() -> dict:
    with open(config.DICTIONARY_SUBSET) as f:
        return json.load(f)


def institute(code: str) -> str:
    return load()["institutes"].get(code.strip(), "")


def facility(code: str) -> str:
    return load()["facilities"].get(code.strip(), "")


def unit(code: str):
    """(description, dimension family, factor to the family's base unit) or None."""
    v = load()["units"].get(code.strip())
    if not v:
        return None
    try:
        factor = float(v[2]) if v[2] else None
    except ValueError:
        factor = None
    return v[0], v[1], factor


def quantity(sf5_8: str):
    """Description and dimension of an SF5-SF8 quantity string such as
    ',SIG,,SFC' or 'PAR,DA'."""
    return load()["quantities"].get(sf5_8)

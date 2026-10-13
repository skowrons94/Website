"""What `dx.py export` writes for the fixture datasets, as JSON on stdout,
for scripts/data-ui/test.mjs to compare with lib/data/export.ts byte for byte.

    python3 scripts/data-ui/expected.py <fixtures/exfor dir>
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "data"))

from nucdata import export  # noqa: E402
from nucdata.store import full_dataset  # noqa: E402

SNAP = {"date": "2026-09-28", "commit": "d2af85eca4ce9b76529f096e7f9603da60654732"}
OPTIONS = [
    {"lab_particle": "projectile", "mass_model": "ame", "error": "point"},
    {"lab_particle": "target", "mass_model": "integer", "error": "stat"},
    {"lab_particle": "projectile", "mass_model": "ame", "error": "total"},
]


def main(root):
    data = os.path.dirname(root)          # full_dataset joins data_dir/exfor/<path>
    out = {"snapshot": SNAP, "datasets": {}}
    sets = []
    for name in sorted(os.listdir(os.path.join(root, "r"))):
        with open(os.path.join(root, "r", name)) as f:
            shard = json.load(f)
        for ds in shard["datasets"]:
            full = full_dataset(data, shard, ds)
            sets.append(full)
            out["datasets"][ds["meta"]["id"]] = {
                "azure2": [export.azure2(full, SNAP, **o) for o in OPTIONS],
                "csv": export.csv_long([full]),
                "bibtex": export.bibtex([full]),
                "json": json.dumps({"schema": "dx-export", "snapshot": SNAP, "datasets": [full]}, ensure_ascii=False),
            }
    out["all"] = {
        "csv": export.csv_long(sets),
        "bibtex": export.bibtex(sets),
        "json": json.dumps({"schema": "dx-export", "snapshot": SNAP, "datasets": sets}, ensure_ascii=False),
        "order": [s["meta"]["id"] for s in sets],
    }
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv[1])

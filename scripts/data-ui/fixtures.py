"""Write the export test's fixture shards (scripts/data-ui/fixtures/exfor/).

    python3 scripts/data-ui/fixtures.py [--data public/data]

Takes the datasets listed in IDS from the built shards, keeps them and their
entries, and writes them the way build-exfor writes shards (compact JSON),
with the full-resolution set of any decimated one. Run it after a data build
when the pipeline's output format changes; the fixtures are committed so the
test runs without one.
"""

import argparse
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "data"))

from nucdata.build_exfor import dumps  # noqa: E402
from nucdata.store import load_shard  # noqa: E402

# slug -> dataset ids
IDS = {
    "14N-p-g": ["O1195.002"],          # S-factor, five final levels, extrapolated rows
    "12C-a-g": ["E2169.002"],          # dσ/dΩ, lab angles, common and point-wise errors
    "3He-a-g": ["O1709.002.1"],        # a pointer
    "197Au-n-g": ["20573.002", "22099.004"],  # decimated (full set in sets/), and a MACS
}


def main(data):
    out = os.path.join(HERE, "fixtures", "exfor")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(os.path.join(out, "r"))
    for slug, ids in IDS.items():
        shard = load_shard(data, slug)
        keep = [d for d in shard["datasets"] if d["meta"]["id"] in ids]
        entries = {e: v for e, v in shard["entries"].items() if any(d["meta"]["entry"] == e for d in keep)}
        small = {k: v for k, v in shard.items() if k not in ("entries", "datasets", "pages")}
        small["entries"] = entries
        small["datasets"] = keep
        with open(os.path.join(out, "r", f"{slug}.json"), "w") as f:
            f.write(dumps(small))
        for d in keep:
            if "decimated" in d:
                src = os.path.join(data, "exfor", d["decimated"]["full"])
                dst = os.path.join(out, d["decimated"]["full"])
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copyfile(src, dst)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="public/data")
    main(ap.parse_args().data)

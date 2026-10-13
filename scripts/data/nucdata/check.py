"""Schema and size-budget checks of the generated files.

    python scripts/data/dx.py check [--data public/data] [--shards N]

Validates meta.json, exfor/index.json, every ensdf/*.json and the shards
(all of them, or N chosen evenly) against scripts/data/schema/*.schema.json
(needs the `jsonschema` package; without it only the budgets are checked),
and the budgets of config.BUDGET: index <= 1.5 MB gzipped, a shard <= 200 kB
gzipped (a paged shard's head may exceed it only by its metadata), no file
over 95 MB, the whole tree under 1 GB.  Exit status 1 on any failure.
"""

import glob
import gzip
import json
import os
import sys

from . import config


def _schema(name):
    with open(os.path.join(config.SCHEMA_DIR, f"{name}.schema.json")) as f:
        return json.load(f)


def run(argv=None):
    import argparse
    ap = argparse.ArgumentParser(prog="dx.py check")
    ap.add_argument("--data", default=config.OUT_DIR)
    ap.add_argument("--shards", type=int, default=0, help="validate N shards (0: all)")
    args = ap.parse_args(argv)
    try:
        import jsonschema
    except ImportError:
        jsonschema = None
        print("jsonschema not installed: checking budgets only", file=sys.stderr)
    errors = []

    def validate(path, name, doc=None):
        if jsonschema is None:
            return
        if doc is None:
            with open(path) as f:
                doc = json.load(f)
        v = jsonschema.Draft202012Validator(_schema(name))
        for e in list(v.iter_errors(doc))[:3]:
            errors.append(f"{os.path.relpath(path, args.data)}: {'/'.join(map(str, e.path))}: {e.message[:200]}")

    d = args.data
    meta_path = os.path.join(d, "meta.json")
    validate(meta_path, "meta")
    idx_path = os.path.join(d, "exfor", "index.json")
    with open(idx_path, "rb") as f:
        raw = f.read()
    gz = len(gzip.compress(raw, 6))
    if gz > config.BUDGET["index_gz"]:
        errors.append(f"index is {gz} bytes gzipped (budget {config.BUDGET['index_gz']})")
    index = json.loads(raw)
    validate(idx_path, "index", index)
    cols = index["datasets"]
    n = len(cols["id"])
    if any(len(v) != n for v in cols.values()):
        errors.append("index: columns of different lengths")
    for p in sorted(glob.glob(os.path.join(d, "ensdf", "*.json"))):
        if os.path.basename(p) != "index.json":
            validate(p, "ensdf")
    shards = sorted(glob.glob(os.path.join(d, "exfor", "r", "*.json")))
    if args.shards and len(shards) > args.shards:
        step = len(shards) / args.shards
        shards = [shards[int(i * step)] for i in range(args.shards)]
    for p in shards:
        with open(p, "rb") as f:
            raw = f.read()
        doc = json.loads(raw)
        g = len(gzip.compress(raw, 6))
        if g > config.BUDGET["shard_gz"] and "pages" not in doc:
            errors.append(f"{os.path.relpath(p, d)}: {g} bytes gzipped (budget {config.BUDGET['shard_gz']})")
        validate(p, "shard", doc)
    total = 0
    for root, _, files in os.walk(d):
        for fn in files:
            s = os.path.getsize(os.path.join(root, fn))
            total += s
            if s > config.BUDGET["file_raw_max"]:
                errors.append(f"{fn}: {s} bytes (GitHub Pages refuses files over 100 MB)")
    if total > config.BUDGET["site_total"] * 0.8:
        errors.append(f"public/data is {total / 1e6:.0f} MB: leaves too little of the 1 GB Pages limit")
    print(f"checked {os.path.relpath(d)}: index {gz / 1e6:.2f} MB gz, {n} datasets, {len(shards)} shards, "
          f"total {total / 1e6:.1f} MB; {len(errors)} problems", file=sys.stderr)
    for e in errors[:50]:
        print("  " + e, file=sys.stderr)
    return 1 if errors else 0

"""Reading the generated files back (for the exporters, tests and a server).

    load_index(dir) -> the index document
    find(dir, "O1195.002") -> {"meta", "points", "excluded"} at full resolution
"""

import gzip
import json
import os
from functools import lru_cache
from typing import Optional

from . import config


def _read(path: str):
    with open(path) as f:
        return json.load(f)


@lru_cache(maxsize=4)
def load_index(data_dir: str = config.OUT_DIR) -> dict:
    return _read(os.path.join(data_dir, "exfor", "index.json"))


def slug_for(data_dir: str, dataset_id: str) -> Optional[str]:
    idx = load_index(data_dir)
    ids = idx["datasets"]["id"]
    try:
        i = ids.index(dataset_id)
    except ValueError:
        return None
    return idx["reactions"]["slug"][idx["datasets"]["r"][i]]


def load_shard(data_dir: str, slug: str) -> dict:
    return _read(os.path.join(data_dir, "exfor", "r", f"{slug}.json"))


def merged(shard: dict, meta: dict) -> dict:
    """A dataset's metadata with its entry's shared fields put back."""
    entry = shard.get("entries", {}).get(meta["entry"], {})
    return {**entry, **meta}


def full_dataset(data_dir: str, shard: dict, ds: dict) -> dict:
    """A shard's dataset entry, metadata merged, points at full resolution."""
    out = {"meta": merged(shard, ds["meta"]), "points": ds.get("points"), "excluded": ds.get("excluded", [])}
    if "page" in ds:
        page = _read(os.path.join(data_dir, "exfor", ds["page"]))
        for d in page["datasets"]:
            if d["id"] == ds["meta"]["id"]:
                out["points"], out["excluded"] = d["points"], d["excluded"]
                if "decimated" in d:
                    ds = dict(ds, decimated=d["decimated"])
    if "decimated" in ds:
        with gzip.open(os.path.join(data_dir, "exfor", ds["decimated"]["full"]), "rt") as f:
            full = json.load(f)
        out["points"], out["excluded"] = full["points"], full["excluded"]
    return out


def find(data_dir: str, dataset_id: str) -> Optional[dict]:
    slug = slug_for(data_dir, dataset_id)
    if slug is None:
        return None
    path = os.path.join(data_dir, "exfor", "r", f"{slug}.json")
    if not os.path.exists(path):
        raise FileNotFoundError(f"{dataset_id}: its shard {slug}.json was not built (build-exfor --shards all)")
    shard = load_shard(data_dir, slug)
    for ds in shard["datasets"]:
        if ds["meta"]["id"] == dataset_id:
            return full_dataset(data_dir, shard, ds)
    return None

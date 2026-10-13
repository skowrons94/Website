"""Paths, pinned sources, scope and budgets of the data pipeline.

Everything that decides *what* is built lives here, so a reviewer can read
the scope in one place:

* SCOPE_A  charged-particle reactions on targets with Z <= 30, projectiles
           p, d, t, 3He, alpha and light ions with Z <= 8;
* SCOPE_B  neutron captures (n,g) on Z = 26-83 (the s-process path);
* SCOPE_M  Maxwellian- and spectrum-averaged neutron data (SF8 MXW, SPA)
           on any target up to Z = 83;
* SCOPE_N  every neutron-induced reaction on Z <= 30.
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.dirname(HERE)                       # scripts/data
REPO = os.path.dirname(os.path.dirname(DATA_DIR))      # repository root
ATLAS_DIR = os.environ.get("ATLAS_DIR", os.path.join(REPO, "content", "atlas"))
NUCLEAR_DATA = os.path.join(ATLAS_DIR, "nuclear-data")
SOURCES_FILE = os.path.join(DATA_DIR, "sources.json")
DICTIONARY_SUBSET = os.path.join(DATA_DIR, "vendor", "exfor-dictionary-subset.json")
SCHEMA_DIR = os.path.join(DATA_DIR, "schema")

# Output tree (served as /data/... by the site).
OUT_DIR = os.environ.get("DX_OUT", os.path.join(REPO, "public", "data"))
CACHE_DIR = os.environ.get("DX_CACHE", os.path.join(REPO, "build", "dx"))

# Schema versions, one per kind of file. Bump on any breaking change.
SCHEMA = {
    "meta": 1,
    "index": 1,
    "shard": 1,
    "set": 1,
    "ensdf": 1,
}

# Budgets (bytes). Gzip sizes, as GitHub Pages and Caddy serve JSON gzipped.
BUDGET = {
    "index_gz": 1_500_000,
    "shard_gz": 200_000,          # a shard above this is decimated (see build_exfor)
    "shard_points_decimated": 400,  # points kept per dataset in a decimated shard
    "file_raw_max": 95_000_000,     # GitHub Pages refuses files over 100 MB
    "site_total": 1_000_000_000,    # and sites over 1 GB
    "ensdf_commit_total": 4_000_000,
}

PROJECTILES_A = {"P", "D", "T", "HE3", "A"}
ION_ZMAX = 8          # light ions written as Z-SYM-A in SF2
TARGET_ZMAX_A = 30
CAPTURE_Z = (26, 83)
MACS_ZMAX = 83
NEUTRON_ZMAX = 30


def sources():
    with open(SOURCES_FILE) as f:
        return json.load(f)

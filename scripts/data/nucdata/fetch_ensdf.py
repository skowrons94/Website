"""Fetch the ENSDF archive (NNDC) for build-ensdf.

    python scripts/data/dx.py fetch-ensdf [--source auto|nndc|mirror] [--record]

* nndc:   the archive zips listed in sources.json (ensdf.ensdf_YYMMDD_[012]99.zip,
          from https://www.nndc.bnl.gov/ensdfarchivals/), each checked against
          its recorded SHA-256.  `--record` stores the checksums of a first
          download in sources.json (commit that change); without it, a file
          with no recorded checksum is accepted and its checksum printed.
* mirror: the per-nuclide original ENSDF files of the same archive, from the
          git repository and commit pinned in sources.json (sparse checkout of
          the *.orig.ens files only).
* auto:   nndc, then mirror if the NNDC host cannot be reached.

The result is a directory under build/dx/ensdf/ and a SOURCE.json beside it
naming what was used, which build-ensdf copies into its metadata.
"""

import hashlib
import io
import json
import os
import subprocess
import sys
import urllib.request
import zipfile

from . import config


def _dir():
    return os.path.join(config.CACHE_DIR, "ensdf")


def fetch_nndc(record: bool = False) -> str:
    src = config.sources()
    ens = src["ensdf"]
    dest = os.path.join(_dir(), "nndc")
    os.makedirs(dest, exist_ok=True)
    sums = dict(ens.get("nndc_sha256") or {})
    for url in ens["nndc_urls"]:
        name = url.rsplit("/", 1)[1]
        with urllib.request.urlopen(url, timeout=120) as r:
            blob = r.read()
        digest = hashlib.sha256(blob).hexdigest()
        if name in sums and sums[name] != digest:
            raise SystemExit(f"{name}: SHA-256 {digest} differs from the recorded {sums[name]}")
        print(f"{name}: sha256 {digest}", file=sys.stderr)
        sums[name] = digest
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            z.extractall(dest)
    if record:
        src["ensdf"]["nndc_sha256"] = sums
        with open(config.SOURCES_FILE, "w") as f:
            json.dump(src, f, indent=2)
            f.write("\n")
    return dest


def fetch_mirror() -> str:
    m = config.sources()["ensdf"]["mirror"]
    dest = os.path.join(_dir(), "mirror")
    if not os.path.isdir(os.path.join(dest, ".git")):
        os.makedirs(dest, exist_ok=True)
        subprocess.run(["git", "init", "-q", dest], check=True)
        subprocess.run(["git", "-C", dest, "remote", "add", "origin", m["repo"]], check=True)
    have = subprocess.run(["git", "-C", dest, "rev-parse", "-q", "--verify", m["commit"] + "^{commit}"],
                          capture_output=True, text=True)
    if have.returncode != 0:
        subprocess.run(["git", "-C", dest, "fetch", "-q", "--depth", "1", "--filter=blob:none",
                        "origin", m["commit"]], check=True)
    subprocess.run(["git", "-C", dest, "sparse-checkout", "set", "--no-cone", "/" + m["pattern"]], check=True)
    subprocess.run(["git", "-C", dest, "checkout", "-q", "--detach", m["commit"]], check=True)
    return dest


def run(argv=None):
    import argparse
    ap = argparse.ArgumentParser(prog="dx.py fetch-ensdf")
    ap.add_argument("--source", choices=["auto", "nndc", "mirror"], default="auto")
    ap.add_argument("--record", action="store_true")
    args = ap.parse_args(argv)
    ens = config.sources()["ensdf"]
    used = None
    if args.source in ("auto", "nndc"):
        try:
            path = fetch_nndc(args.record)
            used = {"kind": "nndc", "urls": ens["nndc_urls"], "archive_date": ens["archive_date"], "path": path}
        except Exception as exc:  # network, 404, bad zip
            if args.source == "nndc":
                raise
            print(f"NNDC archive not available ({exc}); using the pinned mirror", file=sys.stderr)
    if used is None:
        path = fetch_mirror()
        used = {"kind": "mirror", "repo": ens["mirror"]["repo"], "commit": ens["mirror"]["commit"],
                "archive_date": ens["archive_date"], "provenance": ens["mirror"]["provenance"], "path": path}
    with open(os.path.join(_dir(), "SOURCE.json"), "w") as f:
        json.dump(used, f, indent=1)
    print(path)
    return path

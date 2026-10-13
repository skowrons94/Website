"""Lay out ``public/azure2/`` for the static build.

    python browser/assemble.py \\
        --pyodide  <directory with pyodide.js, pyodide.asm.wasm, ...> \\
        --numpy    <numpy wheel built for that Pyodide> \\
        --module   <_azure2.cpython-313-wasm32-emscripten.so> \\
        --pyazr    <AZURE2 source tree>/pyazr \\
        --evaluations build/azure2/evaluations      (from precompute.py) \\
        --out      public/azure2

The pure-Python dependencies (Flask and its own, flask-cors, mpmath) are
fetched from PyPI by exact file and SHA-256 (``PURE``) and shipped as source inside ``runtime.zip`` with
pyazr, the server's ``app`` package and ``bridge.py``; only NumPy, which has
compiled code, is loaded as a Pyodide wheel.
"""

import argparse
import glob
import hashlib
import io
import json
import os
import shutil
import sys
import tarfile
import tempfile
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

PYODIDE_FILES = ("pyodide.js", "pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm",
                 "python_stdlib.zip", "pyodide-lock.json")
# The pure-Python dependencies shipped to the browser, each pinned to one file
# on PyPI by version and SHA-256: the URL is fetched as it is and the build
# stops if a byte differs. No "latest", no resolver, and no setup code of a
# source distribution runs here (MarkupSafe's sdist is only unpacked).
# The versions are those of .github/requirements-build.txt, so the browser
# runs what the server tests ran; the hashes are PyPI's (its JSON API,
# https://pypi.org/pypi/<name>/<version>/json) and agree with that file's.
# To update: change a version there, then the URL and hash here from the JSON.
PYPI = "https://files.pythonhosted.org/packages/"
PURE = (
    ("flask-3.1.3-py3-none-any.whl",
     "7f/9c/34f6962f9b9e9c71f6e5ed806e0d0ff03c9d1b0b2340088a0cf4bce09b18",
     "f4bcbefc124291925f1a26446da31a5178f9483862233b23c0c96a20701f670c"),
    ("werkzeug-3.1.9-py3-none-any.whl",
     "a1/38/df03f564f43cec2684823f3cccae1a652ee7face1cbaa76fb223096e64d7",
     "6392e50c78460ba618e5b21f08a71f59c99ce99cdc6cf6e3dd7e6ccca8754fab"),
    ("jinja2-3.1.6-py3-none-any.whl",
     "62/a1/3d680cbfd5f4b8f15abc1d571870c5fc3e594bb582bc3b64ea099db13e56",
     "85ece4451f492d0c13c5dd7c13a64681a86afae63a5f347908daf103ce6d2f67"),
    ("itsdangerous-2.2.0-py3-none-any.whl",
     "04/96/92447566d16df59b2a776c0fb82dbc4d9e07cd95062562af01e408583fc4",
     "c6242fc49e35958c8b15141343aa660db5fc54d4f13a1db01a3f5891b98700ef"),
    ("click-8.5.0-py3-none-any.whl",
     "58/50/6c0d534c5f134586a8e1ba4e330569e32f057e33372ae556463212fb4cd3",
     "255bc9599cf7748b4b1a446ccc735421bd08a2ae529a8b88597d3de5664ee360"),
    ("blinker-1.9.0-py3-none-any.whl",
     "10/cb/f2ad4230dc2eb1a74edf38f1a38b9b52277f75bef262d8908e60d957e13c",
     "ba0efaa9080b619ff2f3459d1d500c57bddea4a6b424b60a91141db6fd2f08bc"),
    ("flask_cors-6.0.5-py3-none-any.whl",
     "49/55/5bb1a2d918e9f02f131e47a59032bae70e48050e986e941511fd737a935c",
     "68fcf75693e961f3af26683b23c4b9a8fb6b64de17d20d0c37b95e8de7ab2ed8"),
    ("mpmath-1.4.1-py3-none-any.whl",
     "13/f2/abeec3db71d221ccd3cd89d206be1fabf5a3ee7178862f5fba23a59607e0",
     "dc4f0ea2304480d4a9a48a94c1020571558ade522b44a6912efac63a586e140f"),
)
# MarkupSafe ships only compiled wheels; its source falls back to pure Python
# when the C speedups are missing.
MARKUPSAFE = ("markupsafe-3.0.3.tar.gz",
              "7e/99/7690b6d4034fffd95959cbe0c02de8deb3098cc577c67bb6a24fe5d7caa7",
              "722695808f4b6457b320fdc131280796bdceb04ab50fe1795cd540799ebe1698")


# Directories whose files the page never reads: AZURE2's check files (``checks``
# of the model and of every derived one -- 47 MB of ¹⁴N's raw 52 MB).  They are
# shipped empty, so AZURE2 finds them.
EMPTY_DIRS = ("checks",)
SKIP_FILES = (".lock", ".probe")
SKIP_PREFIXES = (".precomputed-", ".fine-", ".initial-")


def unused(source):
    """Files of an evaluation the page never reads: its own extrapolations'
    integrals when a derived model calculates them (``extrapolations/``),
    and ``initial.json`` and ``initial-extrapolations.json``, which the
    page fetches on its own."""
    out = {os.path.join(source, "initial.json"),
           os.path.join(source, "initial-extrapolations.json")}
    if os.path.exists(os.path.join(source, "extrapolations", "extrap.azr")):
        out.add(os.path.join(source, "output", "intEC.extrap"))
    return out


def add_tree(z, source, prefix, empty=(), skip=()):
    for dirpath, dirnames, filenames in os.walk(source):
        dirnames.sort()
        for d in [d for d in dirnames if d in empty]:
            rel = os.path.relpath(os.path.join(dirpath, d), source)
            z.writestr(os.path.join(prefix, rel) + "/", b"")
        dirnames[:] = [d for d in dirnames if d != "__pycache__" and d not in empty]
        for name in sorted(filenames):
            path = os.path.join(dirpath, name)
            if name.endswith((".pyc", ".c", ".pyi")) or name in SKIP_FILES \
                    or name.startswith(SKIP_PREFIXES) or path in skip:
                continue
            z.write(path, os.path.join(prefix, os.path.relpath(path, source)))


def fetch(pin, directory):
    """Download one pinned file from PyPI and check its SHA-256."""
    name, path, sha256 = pin
    target = os.path.join(directory, name)
    with urllib.request.urlopen(f"{PYPI}{path}/{name}", timeout=120) as r:
        data = r.read()
    got = hashlib.sha256(data).hexdigest()
    if got != sha256:
        sys.exit(f"{name}: SHA-256 {got}, expected {sha256}")
    with open(target, "wb") as f:
        f.write(data)
    return target


def pure_packages(z):
    """Pure-Python dependencies, unpacked from their pinned PyPI files."""
    with tempfile.TemporaryDirectory() as tmp:
        for pin in PURE:
            with zipfile.ZipFile(fetch(pin, tmp)) as w:
                for name in w.namelist():
                    if ".dist-info/" in name and not name.endswith("METADATA"):
                        continue
                    z.writestr(name, w.read(name))
        with tarfile.open(fetch(MARKUPSAFE, tmp)) as t:
            for m in t.getmembers():
                parts = m.name.split("/")
                if m.isfile() and "src" in parts and parts[-1].endswith((".py", ".typed")):
                    z.writestr("/".join(parts[parts.index("src") + 1:]), t.extractfile(m).read())


def main():
    ap = argparse.ArgumentParser()
    for name in ("pyodide", "numpy", "module", "pyazr", "evaluations", "out"):
        ap.add_argument(f"--{name}", required=True)
    a = ap.parse_args()

    if os.path.exists(a.out):
        shutil.rmtree(a.out)
    os.makedirs(os.path.join(a.out, "pyodide"))
    os.makedirs(os.path.join(a.out, "wheels"))
    os.makedirs(os.path.join(a.out, "evaluations"))

    for name in PYODIDE_FILES:
        shutil.copy(os.path.join(a.pyodide, name), os.path.join(a.out, "pyodide", name))
    shutil.copy(a.numpy, os.path.join(a.out, "wheels"))
    shutil.copy(os.path.join(HERE, "worker.js"), os.path.join(a.out, "worker.js"))

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        add_tree(z, a.pyazr, "pyazr")
        z.write(a.module, "pyazr/" + os.path.basename(a.module))
        add_tree(z, os.path.join(REPO, "server", "app"), "app")
        z.write(os.path.join(REPO, "server", "config.py"), "config.py")
        z.write(os.path.join(HERE, "bridge.py"), "bridge.py")
        pure_packages(z)
    with open(os.path.join(a.out, "runtime.zip"), "wb") as f:
        f.write(buf.getvalue())

    shutil.copy(os.path.join(a.evaluations, "index.json"), os.path.join(a.out, "evaluations"))
    for entry in sorted(os.listdir(a.evaluations)):
        source = os.path.join(a.evaluations, entry)
        if not os.path.isdir(source):
            continue
        with zipfile.ZipFile(os.path.join(a.out, "evaluations", entry + ".zip"), "w",
                             zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            add_tree(z, source, "", empty=EMPTY_DIRS, skip=unused(source))
        # The .azr file is also offered for download as it is, and the
        # initial payload (app/initial.py) is fetched by the page directly,
        # before Pyodide starts: azure2/evaluations/<id>/initial.json.
        os.makedirs(os.path.join(a.out, "evaluations", entry), exist_ok=True)
        for azr in glob.glob(os.path.join(source, "*.azr")):
            shutil.copy(azr, os.path.join(a.out, "evaluations", entry))
        if os.path.exists(os.path.join(source, "initial.json")):
            shutil.copy(os.path.join(source, "initial.json"),
                        os.path.join(a.out, "evaluations", entry, "initial.json"))
        # The published extrapolations, shown faded while a visitor's own
        # are calculated (app/initial.py).
        if os.path.exists(os.path.join(source, "initial-extrapolations.json")):
            shutil.copy(os.path.join(source, "initial-extrapolations.json"),
                        os.path.join(a.out, "evaluations", entry, "extrapolations.json"))

    # The wheels, and a hash of the large files: the workers keep them in the
    # Cache Storage under it (worker.js), so a new build is fetched anew.
    hashes = {}
    big = ["pyodide/pyodide.asm.wasm", "pyodide/python_stdlib.zip",
           "wheels/" + os.path.basename(a.numpy)]
    for name in big + ["runtime.zip"] + sorted(
            "evaluations/" + n for n in os.listdir(os.path.join(a.out, "evaluations"))
            if n.endswith(".zip")):
        with open(os.path.join(a.out, name), "rb") as f:
            hashes[name] = hashlib.sha256(f.read()).hexdigest()[:16]
    with open(os.path.join(a.out, "manifest.json"), "w") as f:
        json.dump({"wheels": [os.path.basename(a.numpy)], "hashes": hashes}, f, indent=1)

    total = sum(os.path.getsize(os.path.join(d, f))
                for d, _, fs in os.walk(a.out) for f in fs)
    print(f"{a.out}: {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()

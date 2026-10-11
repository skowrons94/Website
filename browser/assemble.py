"""Lay out ``public/azure2/`` for the static build.

    python browser/assemble.py \\
        --pyodide  <directory with pyodide.js, pyodide.asm.wasm, ...> \\
        --numpy    <numpy wheel built for that Pyodide> \\
        --module   <_azure2.cpython-313-wasm32-emscripten.so> \\
        --pyazr    <AZURE2 source tree>/pyazr \\
        --evaluations build/azure2/evaluations      (from precompute.py) \\
        --out      public/azure2

The pure-Python dependencies (Flask and its own, flask-cors, mpmath) are
fetched from PyPI with pip and shipped as source inside ``runtime.zip`` with
pyazr, the server's ``app`` package and ``bridge.py``; only NumPy, which has
compiled code, is loaded as a Pyodide wheel.
"""

import argparse
import glob
import io
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

PYODIDE_FILES = ("pyodide.js", "pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm",
                 "python_stdlib.zip", "pyodide-lock.json")
PURE = ("flask", "werkzeug", "jinja2", "itsdangerous", "click", "blinker",
        "flask-cors", "mpmath")


def add_tree(z, source, prefix):
    for dirpath, dirnames, filenames in os.walk(source):
        dirnames[:] = [d for d in dirnames if d != "__pycache__"]
        for name in filenames:
            if name.endswith((".pyc", ".c", ".pyi")):
                continue
            path = os.path.join(dirpath, name)
            z.write(path, os.path.join(prefix, os.path.relpath(path, source)))


def pure_packages(z):
    """Pure-Python dependencies, unpacked from their PyPI wheels."""
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, "-m", "pip", "download", "--quiet", "--no-deps",
                        "--only-binary", ":all:", "--python-version", "3.13",
                        "--platform", "any", "-d", tmp, *PURE], check=True)
        for wheel in glob.glob(os.path.join(tmp, "*.whl")):
            with zipfile.ZipFile(wheel) as w:
                for name in w.namelist():
                    if ".dist-info/" in name and not name.endswith("METADATA"):
                        continue
                    z.writestr(name, w.read(name))
        # MarkupSafe ships only compiled wheels; its source falls back to pure
        # Python when the C speedups are missing.
        subprocess.run([sys.executable, "-m", "pip", "download", "--quiet", "--no-deps",
                        "--no-binary", ":all:", "-d", tmp, "markupsafe"], check=True)
        sdist = glob.glob(os.path.join(tmp, "[Mm]arkup[Ss]afe-*.tar.gz"))[0]
        with tarfile.open(sdist) as t:
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
    with open(os.path.join(a.out, "manifest.json"), "w") as f:
        f.write('{"wheels": ["%s"]}\n' % os.path.basename(a.numpy))
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
                             zipfile.ZIP_DEFLATED) as z:
            add_tree(z, source, "")
        # The .azr file is also offered for download as it is.
        for azr in glob.glob(os.path.join(source, "*.azr")):
            os.makedirs(os.path.join(a.out, "evaluations", entry), exist_ok=True)
            shutil.copy(azr, os.path.join(a.out, "evaluations", entry))

    total = sum(os.path.getsize(os.path.join(d, f))
                for d, _, fs in os.walk(a.out) for f in fs)
    print(f"{a.out}: {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()

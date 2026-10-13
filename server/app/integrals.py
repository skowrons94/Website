"""Frozen external-capture integrals.

An evaluation whose ``output/FROZEN`` lists its integral files (``<sha256>
<path>`` per line, ``#`` comments) is calculated with exactly those files, never
with integrals AZURE2 computes again:

* :func:`check` refuses to open a model when a listed file is missing or
  differs from its hash (someone regenerated or edited it);
* a file named ``output/<dir>-intEC.<ext>`` (with its ``.sig``) seeds the
  derived model the server builds in a directory named ``<dir>``
  (:func:`seed`) -- next to the evaluation, or in a temporary directory of
  that name when the evaluation's is read-only (``app.fine.workdir_for``);
* :func:`guard` wraps every build of a model.  If AZURE2 rewrote an integral
  file (it does when the signature beside it does not match), the frozen
  copy is put back and the build fails; if it wrote one that was not there
  (a derived model without a seed), that is removed and the build fails.
  Either way no curve comes from other integrals.

``app.check`` reports a broken list (:func:`problems`); ``scripts/add-evaluation.py``
will not replace a frozen evaluation; ``browser/assemble.py`` ships a seed once.
"""

import contextlib
import hashlib
import os
import re
import tempfile

MARKER = os.path.join("output", "FROZEN")
_NAMES = ("intEC.dat", "intEC.extrap", "intEC.dat.sig", "intEC.extrap.sig")
_SEED = re.compile(r"^output/([A-Za-z0-9_.-]+)-(intEC\.(?:dat|extrap)(?:\.sig)?)$")


class FrozenIntegralsError(RuntimeError):
    """A frozen evaluation's integrals are not the listed ones, or AZURE2
    recalculated them."""


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


_sha256 = sha256


def _digest(content):
    return hashlib.sha256(content).hexdigest()


def frozen(directory):
    """``{relative path: sha256}`` of the evaluation's frozen files; ``{}``
    when it has none.  Lines as ``sha256sum`` writes them (text or binary
    mode), any whitespace between hash and path."""
    try:
        with open(os.path.join(directory, MARKER)) as f:
            lines = f.read().splitlines()
    except OSError:
        return {}
    out = {}
    for line in lines:
        parts = line.strip().split(None, 1)
        if len(parts) != 2 or parts[0].startswith("#"):
            continue
        out[parts[1].strip().lstrip("*")] = parts[0].lower()
    return out


def seeds(directory):
    """``{(dir, name): relative path of the seed}`` of the evaluation's
    derived models."""
    out = {}
    for path in frozen(directory):
        m = _SEED.match(path)
        if m:
            out[(m.group(1), m.group(2))] = path
    return out


def problems(directory):
    """What is wrong with the frozen files of an evaluation ([] if nothing).
    A seed counts as present when the derived model's own copy is there
    (the in-browser build ships only that one)."""
    listed = frozen(directory)
    seeded = {path: (role, name) for (role, name), path in seeds(directory).items()}
    out = []
    for path, digest in listed.items():
        candidates = [os.path.join(directory, path)]
        if path in seeded:
            role, name = seeded[path]
            candidates.append(os.path.join(directory, role, "output", name))
        present = [c for c in candidates if os.path.isfile(c)]
        if not present:
            out.append(f"{path} is missing")
        elif not any(sha256(c) == digest for c in present):
            out.append(f"{path} differs from the hash in {MARKER}")
    return out


def check(directory):
    """Raise unless the evaluation's frozen files are the listed ones."""
    bad = problems(directory)
    if bad:
        raise FrozenIntegralsError(
            f"{os.path.basename(os.path.normpath(directory))}: frozen external-capture "
            f"integrals: {'; '.join(bad)}. They must not be regenerated ({MARKER}).")


def _write(path, content):
    """Write ``content`` to ``path`` atomically (a reader never sees half)."""
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".frozen-")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(content)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def _expected(directory, workdir):
    """``{file name in the model's output/: sha256}`` for the evaluation's
    own model (``workdir`` None) or the derived one in ``workdir``."""
    listed = frozen(directory)
    if workdir is None:
        return {name: listed[f"output/{name}"] for name in _NAMES if f"output/{name}" in listed}
    role = os.path.basename(os.path.normpath(workdir))
    return {name: listed[path] for (r, name), path in seeds(directory).items() if r == role}


def seed(directory, workdir):
    """Copy the frozen integrals of the derived model in ``workdir`` (a
    directory named ``fine``, ``extrapolations`` ...) into its ``output/``,
    unless they are there already."""
    role = os.path.basename(os.path.normpath(workdir))
    listed = frozen(directory)
    for (r, name), path in seeds(directory).items():
        if r != role:
            continue
        target = os.path.join(workdir, "output", name)
        if os.path.isfile(target) and sha256(target) == listed[path]:
            continue
        with open(os.path.join(directory, path), "rb") as f:
            content = f.read()
        if _digest(content) != listed[path]:
            raise FrozenIntegralsError(f"{path} differs from the hash in {MARKER}")
        os.makedirs(os.path.dirname(target), exist_ok=True)
        _write(target, content)


def output_dir(path, cwd):
    """The output directory of the model at ``path``, as AZURE2 resolves it:
    its <config>'s second row, relative to ``cwd`` when not absolute; None
    when the file cannot be read."""
    try:
        with open(path) as f:
            config = re.search(r"<config>\r?\n(.*?)</config>", f.read(), flags=re.S)
        row = config.group(1).splitlines()[1].split("#")[0].strip()
    except (OSError, AttributeError, IndexError):
        return None
    return row if os.path.isabs(row) else os.path.join(cwd, row)


@contextlib.contextmanager
def guard(cwd, path):
    """Around a build (open, or a switch of mode) of the model at ``path``
    belonging to the evaluation in ``cwd``.  Nothing for an evaluation
    without frozen integrals."""
    if not frozen(cwd):
        yield
        return
    check(cwd)
    home = os.path.dirname(os.path.abspath(path))
    derived = os.path.normpath(home) != os.path.normpath(os.path.abspath(cwd))
    if derived:
        seed(cwd, home)
    output = output_dir(path, cwd)
    if output is None:
        raise FrozenIntegralsError(
            f"{path}: its output directory cannot be read from <config>, so its "
            f"frozen integrals cannot be guarded")
    expected = _expected(cwd, home if derived else None)
    before = {}
    for name in _NAMES:
        full = os.path.join(output, name)
        if os.path.isfile(full):
            with open(full, "rb") as f:
                before[name] = f.read()
    changed, created = [], []
    try:
        yield
    finally:
        for name in _NAMES:
            full = os.path.join(output, name)
            if name in before:
                try:
                    with open(full, "rb") as f:
                        same = f.read() == before[name]
                except OSError:
                    same = False
                if same:
                    continue
                changed.append(name)
                # Put back only what is known to be the frozen file.
                if expected.get(name) == _digest(before[name]):
                    _write(full, before[name])
            elif os.path.exists(full):
                created.append(name)
                try:
                    os.remove(full)
                except OSError:
                    pass
    if changed or created:
        what = ", ".join(sorted(changed + created))
        raise FrozenIntegralsError(
            f"AZURE2 calculated external-capture integrals of "
            f"{os.path.basename(os.path.normpath(cwd))} ({what} in {output}) instead of "
            f"reading the frozen ones ({MARKER}); "
            + ("they were put back.  The signature it computed does not match the .sig "
               "beside them." if changed else "there were none to read: a derived model "
               "with no seed (output/<dir>-intEC.*)."))

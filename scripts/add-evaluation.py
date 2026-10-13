#!/usr/bin/env python3
"""Add an R-matrix evaluation to the site from an AZURE2 .azr file.

    make add-evaluation ID=12C AZR=~/azure/12C/12C.azr [DATA=~/azure/12C/data]
    npm run eval:new -- 12C ~/azure/12C/12C.azr [--data ~/azure/12C/data]
    python3 scripts/add-evaluation.py 12C ~/azure/12C/12C.azr [--data DIR]

It creates server/evaluations/<ID>/ with

* <ID>.azr -- your file, with every path made relative (data/x.dat, output/,
  checks/), so it works on the server and in the browser as on your machine;
* data/ -- every data file the model reads, found where the .azr says, or in
  --data, or next to the .azr;
* output/intEC.dat, output/intEC.extrap -- AZURE2's external-capture
  integrals from your run, when there are any (they are slow to recompute);
* info.json -- filled in as far as the file allows (reactions, a label for
  every data file, the atlas pages that match), with TODO where only you
  know the answer;

then checks the result and prints what is left to do.  Nothing outside that
directory is changed.

Only files the .azr names (its segments' data files, and the external-capture
integrals in its output directory) are copied, and only from inside the
.azr's own directory tree or a --data directory you name: a path in the .azr
that leads elsewhere (/etc/passwd, ../../.ssh/id_rsa, a symlink pointing
out) is refused, so a collaborator's .azr cannot get a private file
committed.  Every copy is listed as source -> destination.  docs/ADDING-AN-EVALUATION.md is the full guide.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "server"))

from app import check  # noqa: E402

ROOT = os.path.join(REPO, "server", "evaluations")
ATLAS = os.path.join(REPO, "content", "atlas", "reactions")
# Particles as atlas file names write them (12C-pg-13N): see content/atlas/README.md.
PARTICLE = {"p": "p", "n": "n", "d": "d", "t": "t", "α": "a", "γ": "g", "³He": "3He", "e⁻": "e"}
SUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")


class Failure(Exception):
    pass


def say(text=""):
    print(text, flush=True)


def inside(path, roots):
    """Is ``path``, symlinks resolved, inside one of ``roots`` (real paths)?"""
    real = os.path.realpath(path)
    return any(real == r or real.startswith(r.rstrip(os.sep) + os.sep) for r in roots)


def allowed_roots(azr_dir, data_dirs):
    """Where files may be copied from: the .azr's own directory tree and the
    --data directories named on the command line, as real paths."""
    return [os.path.realpath(d) for d in [azr_dir] + list(data_dirs) if os.path.isdir(d)]


def resolve(path, azr_dir, data_dirs, roots=None):
    """Where a path written in the .azr file really is, or None.  Raises
    Failure when it is a file outside ``roots`` (see allowed_roots)."""
    roots = roots if roots is not None else allowed_roots(azr_dir, data_dirs)
    expanded = os.path.expanduser(path.replace("\\", "/"))
    candidates = [expanded] if os.path.isabs(expanded) else [os.path.join(azr_dir, expanded)]
    base = os.path.basename(expanded)
    candidates += [os.path.join(d, base) for d in data_dirs]
    outside = None
    for c in candidates:
        if not os.path.isfile(c):
            continue
        if inside(c, roots):
            return c
        outside = outside or c
    if outside is not None:
        raise Failure(
            f"the .azr names {path}, which is {os.path.realpath(outside)}: outside the "
            f".azr's directory ({azr_dir}) and any --data directory. Refusing to copy it. "
            "If it really is a data file of this model, copy it next to the .azr (or "
            "into its data/) and point the .azr there, or pass its directory with "
            "DATA=... (--data).")
    return None


def safe_name(base, path):
    """A data file's name as it will be in data/: a plain file name."""
    if base in ("", ".", "..") or "/" in base or "\x00" in base:
        raise Failure(f"the .azr names {path!r}, which is not a file name")
    return base


def rewrite(text, azr_dir, data_dirs, dest):
    """The .azr text with relative paths; copies the data files into dest/data."""
    roots = allowed_roots(azr_dir, data_dirs)
    lines = text.split("\n")
    copied = {}         # basename -> source
    missing = []
    output_dir = None
    for number, kind, path in list(check.azr_paths(text)):
        i = number - 1
        if kind in ("output", "checks"):
            if kind == "output":
                expanded = os.path.expanduser(path)
                output_dir = expanded if os.path.isabs(expanded) else os.path.join(azr_dir, expanded)
            lines[i] = lines[i].replace(path, f"{kind}/", 1) if path else f"{kind}/" + lines[i]
        elif kind == "data":
            source = resolve(path, azr_dir, data_dirs, roots)
            base = safe_name(os.path.basename(path.replace("\\", "/")), path)
            if source is None:
                if path not in missing:
                    missing.append(path)
                continue
            if base in copied and os.path.realpath(copied[base]) != os.path.realpath(source):
                raise Failure(f"two different data files are both called {base} "
                              f"({copied[base]} and {source}); rename one in AZURE2 first")
            copied[base] = source
            lines[i] = re.sub(r"(?<!\S)" + re.escape(path) + r"(?!\S)", f"data/{base}", lines[i], count=1)
        elif kind == "lastrun" and check.is_absolute(path):
            lines[i] = lines[i].replace(f'"{path}"', f'"output/{os.path.basename(path)}"', 1)
    if missing:
        where = ", ".join([azr_dir] + data_dirs)
        raise Failure("these data files are not where the .azr says, nor in " + where + ":\n  "
                      + "\n  ".join(missing)
                      + "\nPass the directory that holds them with DATA=... (or --data).")
    os.makedirs(os.path.join(dest, "data"), exist_ok=True)
    for base, source in copied.items():
        real = os.path.realpath(source)
        if not inside(real, roots):           # changed since it was resolved
            raise Failure(f"{source} now leads outside the .azr's directory; refusing to copy it")
        shutil.copy2(real, os.path.join(dest, "data", base))
        say(f"  {real} -> data/{base}")
    return "\n".join(lines), copied, output_dir


def derived(dest):
    """(reactions, title) from the model, when pyazr is importable; else ([], None)."""
    try:
        from app import evaluations
        evaluation = evaluations.load(dest)
    except Exception as err:            # no pyazr here, or it cannot read the file
        say(f"  (could not read the model with pyazr: {err}; fill in `reactions` by hand)")
        return [], None
    if evaluation is None:
        return [], None
    return evaluation.reactions, evaluation.title


def atlas_id(reaction):
    """'¹²C(p,γ)¹³N' -> '12C-pg-13N', the atlas file name it would have."""
    m = re.match(r"^(\S+)\(([^,()]+),([^,()]+)\)(\S+)$", reaction)
    if not m:
        return None
    target, a, b, product = m.groups()
    try:
        tag = PARTICLE[a] + PARTICLE[b]
    except KeyError:
        return None
    return f"{target.translate(SUP)}-{tag}-{product.translate(SUP)}"


def info_template(eid, reactions, files, title):
    from app.evaluations import dataset_label
    atlas = [a for a in (atlas_id(r) for r in reactions)
             if a and os.path.isfile(os.path.join(ATLAS, f"{a}.yaml"))]
    info = {
        "$schema": "../../app/info.schema.json",
        "status": "in-progress",
        "reference": None,
        "analysis": "TODO: who made the R-matrix analysis, as in a reference (A. Rossi, B. Bianchi)",
        "purpose": "TODO: one plain sentence, in English, on what this reaction does in stars.",
        "purpose_it": "TODO: la stessa frase, in italiano.",
        "reactions": reactions or ["TODO: e.g. ¹²C(p,γ)¹³N"],
        "datasets": {check.stem(f): dataset_label(check.stem(f)) for f in files},
    }
    if atlas:
        info["atlas"] = sorted(set(atlas))
    if title and not title.startswith("^"):
        info["title"] = title
    return info


def run_checks(eid, root):
    """Check the new evaluation: the site's checker when node is here (it
    includes the server's checks), else the server's.  Returns 1 only for
    errors other than the TODOs this command leaves on purpose."""
    problems = check.check_root(root, [eid])
    node = shutil.which("node")
    if node and os.path.abspath(root) == os.path.abspath(ROOT):
        say("\nChecking it (npm run check:evaluations):")
        subprocess.run([node, os.path.join(REPO, "scripts", "evaluations-check.mjs"), eid], cwd=REPO)
    else:
        say("\nChecking it (python -m app.check):")
        check.report(problems)
    serious = [p for p in problems if p.level == "error" and "still says" not in p.message]
    return 1 if serious else 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                     formatter_class=argparse.RawDescriptionHelpFormatter,
                                     epilog="See docs/ADDING-AN-EVALUATION.md.")
    parser.add_argument("id", help="the evaluation's id and web address, e.g. 12C (letters, digits, - and _)")
    parser.add_argument("azr", help="the .azr file, as AZURE2 saved it")
    parser.add_argument("--data", action="append", default=[],
                        help="a directory holding the data files (repeatable); by default they are "
                             "looked for where the .azr says, then next to it and in its data/")
    parser.add_argument("--root", default=ROOT, help=argparse.SUPPRESS)
    parser.add_argument("--force", action="store_true",
                        help="replace an existing evaluation of that id (its info.json is kept)")
    parser.add_argument("--no-check", action="store_true", help=argparse.SUPPRESS)
    a = parser.parse_args(argv)

    eid = a.id.strip()
    if not check.ID.match(eid):
        raise Failure(f"{eid!r} cannot be an id: it is also the web address "
                      "(/evaluations/<id>), so use letters, digits, - and _ only, e.g. 12C or 12C-2025")
    azr = os.path.abspath(os.path.expanduser(a.azr))
    if not os.path.isfile(azr):
        raise Failure(f"there is no file {azr}")
    if not azr.endswith(".azr"):
        raise Failure(f"{azr} is not an .azr file")
    dest = os.path.join(a.root, eid)
    existing = [n for n in os.listdir(a.root) if n.lower() == eid.lower()] if os.path.isdir(a.root) else []
    kept_info = None
    if existing and not a.force:
        raise Failure(f"server/evaluations/{existing[0]} already exists. Pick another id "
                      f"(a second evaluation of the same nucleus: {eid}-2025, say), or pass "
                      "--force (FORCE=1 with make) to replace its model and data, keeping its info.json")
    if existing:
        info_path = os.path.join(a.root, existing[0], "info.json")
        if os.path.isfile(info_path):
            with open(info_path, encoding="utf-8") as f:
                kept_info = f.read()
        shutil.rmtree(os.path.join(a.root, existing[0]))

    azr_dir = os.path.dirname(azr)
    data_dirs = [os.path.abspath(os.path.expanduser(d)) for d in a.data] + [os.path.join(azr_dir, "data")]
    with open(azr, encoding="utf-8", errors="replace") as f:
        text = f.read()
    if "<segmentsData>" not in text:
        raise Failure(f"{azr} has no <segmentsData> block: is it an AZURE2 file?")

    say(f"Adding {eid} from {azr}")
    os.makedirs(dest)
    try:
        new_text, copied, output_dir = rewrite(text, azr_dir, data_dirs, dest)
        with open(os.path.join(dest, f"{eid}.azr"), "w", encoding="utf-8") as f:
            f.write(new_text)
        say(f"  {eid}.azr (paths made relative), data/ ({len(copied)} file(s))")
        os.makedirs(os.path.join(dest, "output"), exist_ok=True)
        roots = allowed_roots(azr_dir, [])
        for name in ("intEC.dat", "intEC.extrap"):
            for src_dir in [d for d in (output_dir, os.path.join(azr_dir, "output")) if d]:
                src = os.path.join(src_dir, name)
                if not os.path.isfile(src):
                    continue
                if not inside(src, roots):
                    say(f"  (not copying {os.path.realpath(src)}: the .azr's output directory "
                        f"is outside {azr_dir}; AZURE2 recomputes {name} on the server)")
                    continue
                real = os.path.realpath(src)
                shutil.copy2(real, os.path.join(dest, "output", name))
                say(f"  {real} -> output/{name}")
                break

        files = check.segment_files(new_text)
        if kept_info is not None:
            with open(os.path.join(dest, "info.json"), "w", encoding="utf-8") as f:
                f.write(kept_info)
            say("  info.json (kept from the evaluation it replaces)")
        else:
            reactions, title = derived(dest)
            info = info_template(eid, reactions, files, title)
            with open(os.path.join(dest, "info.json"), "w", encoding="utf-8") as f:
                json.dump(info, f, ensure_ascii=False, indent=2)
                f.write("\n")
            say(f"  info.json (reactions: {', '.join(reactions) or 'TODO'}; "
                f"atlas pages: {', '.join(info.get('atlas', [])) or 'none matched'})")
    except BaseException:
        shutil.rmtree(dest, ignore_errors=True)
        raise

    status = 0 if a.no_check else run_checks(eid, a.root)
    rel = os.path.relpath(dest, REPO)
    say(f"""
What is left (docs/ADDING-AN-EVALUATION.md has the details):
  1. Edit {rel}/info.json: replace every TODO (analysis, purpose,
     purpose_it), check `reactions` (headline reaction first), `status`, and give the
     data files proper labels ("Author year", or {{"label", "ref", "doi"}}).
     Link it from the reaction atlas: list the atlas pages it belongs on in
     `atlas` (file names in content/atlas/reactions/, e.g. "12C-pg-13N").
  2. Check it:            npm run check:evaluations   (or: make check-evaluations)
  3. Measure its timings: python -m app.warm {eid}   (from server/; Docker: make warm)
  4. See it:              make dev-server and make dev-site, then /evaluations/{eid}
  5. Commit the directory: git add {rel} && git commit
""")
    return status


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Failure as err:
        print(f"add-evaluation: {err}", file=sys.stderr)
        sys.exit(2)

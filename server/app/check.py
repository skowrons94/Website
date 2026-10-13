"""Check every evaluation before it goes on the site.

    python -m app.check              # from server/: every evaluation
    python -m app.check 12C          # only these
    npm run check:evaluations        # the same checks, plus the site's (atlas links)

Each problem is printed with the file it is in and what to do about it; the
exit status is 1 when there is an error.  Warnings do not fail the check.

What is checked (docs/ADDING-AN-EVALUATION.md explains each field):

* ``info.json`` parses, and matches ``app/info.schema.json``: the required
  fields are there, ``status`` is a known value, DOIs are bare ``10.xxxx/...``,
  ``reactions`` read like ``¹²C(p,γ)¹³N``, ``split_total_capture`` is
  true/false, no unknown (misspelt) fields;
* the ``.azr`` file: exactly one, its paths relative (``data/x.dat``, not
  ``/home/...``, which only work on the machine that wrote them), every data
  file it reads present;
* ``datasets``: every key is a data file the model reads, and every data file
  has a label;
* the atlas (when ``content/atlas/reactions`` is next to the server): the
  pages in ``atlas`` exist, and every ``rmatrix:`` id is an evaluation;
* ``timings.json`` (written by ``python -m app.warm``) and
  ``output/intEC.*``: warnings only.

The server runs the same checks when it starts and logs what it finds
(:func:`log_problems`), so a broken evaluation is reported, not just hidden.
"""

import argparse
import difflib
import json
import logging
import os
import re
import sys
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

log = logging.getLogger(__name__)

HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(HERE, "info.schema.json")
# The repository's atlas, when the server runs from a checkout (not in the
# container, which has no content/).
ATLAS_REACTIONS = os.path.join(HERE, "..", "..", "content", "atlas", "reactions")

DOI = re.compile(r"^10\.\d{4,9}/[^\s]+[^\s.,;]$")
ID = re.compile(r"^[0-9A-Za-z][0-9A-Za-z_-]*$")


@dataclass
class Problem:
    level: str      # "error" or "warning"
    where: str      # "13N/info.json"
    message: str

    def __str__(self):
        return f"{self.level.upper():7s} {self.where}: {self.message}"


def load_schema() -> Dict:
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


# -- a small JSON Schema validator (the subset info.schema.json uses) --------
# The site's Node checker (scripts/evaluations-check.mjs) implements the same
# subset, so the two agree without either needing a dependency.

_TYPES = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "null": lambda v: v is None,
}


def _shown(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def _type_name(value) -> str:
    for name in ("null", "boolean", "integer", "number", "string", "array", "object"):
        if _TYPES[name](value):
            return {"integer": "a number", "number": "a number", "null": "null",
                    "boolean": "true/false", "string": "text", "array": "a list",
                    "object": "an object"}[name]
    return type(value).__name__


def validate(value, schema: Dict, path: str = "") -> List[str]:
    """Messages for every way ``value`` breaks ``schema`` (empty: valid)."""
    here = f"`{path}`" if path else "the file"
    if "anyOf" in schema:
        options = [validate(value, s, path) for s in schema["anyOf"]]
        if any(not o for o in options):
            return []
        # The option for the value's own type explains best ({"doi": ...}
        # is an object with a bad DOI, not "text expected").
        own = [o for o, sub in zip(options, schema["anyOf"])
               if "type" in sub and _TYPES[sub["type"]](value)]
        return own[0] if own else min(options, key=len)
    out = []
    types = schema.get("type")
    if types is not None:
        types = types if isinstance(types, list) else [types]
        if not any(_TYPES[t](value) for t in types):
            wanted = " or ".join({"string": "text", "boolean": "true or false",
                                  "array": "a list [...]", "object": "an object {...}",
                                  "integer": "a whole number", "number": "a number",
                                  "null": "null"}[t] for t in types)
            return [f"{here} must be {wanted}, not {_type_name(value)} ({_shown(value)})"]
    if "enum" in schema and value not in schema["enum"]:
        allowed = ", ".join(_shown(v) for v in schema["enum"])
        guess = difflib.get_close_matches(str(value), [str(v) for v in schema["enum"]], 1)
        hint = f" (did you mean {_shown(guess[0])}?)" if guess else ""
        out.append(f"{here} is {_shown(value)}; it must be one of {allowed}{hint}")
    if isinstance(value, str):
        if len(value.strip()) < schema.get("minLength", 0):
            out.append(f"{here} is empty or too short" if value.strip()
                       else f"{here} is empty")
        # a TODO placeholder is reported once, as such (_todos below)
        elif ("pattern" in schema and "TODO" not in value
              and not re.search(schema["pattern"], value)):
            out.append(f"{here} is {_shown(value)}, which does not look right: "
                       + _pattern_hint(path, value))
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            out.append(f"{here} must be at least {schema['minimum']}")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            out.append(f"{here} must list at least {schema['minItems']} item(s)")
        if "items" in schema:
            for i, item in enumerate(value):
                out += validate(item, schema["items"], f"{path}[{i}]")
    if isinstance(value, dict):
        props = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                out.append(f"{here} has no `{key}`; add it"
                           + (f" ({props[key]['description']})"
                              if props.get(key, {}).get("description") else ""))
        extra = schema.get("additionalProperties", True)
        for key, item in value.items():
            sub = f"{path}.{key}" if path else key
            if key in props:
                out += validate(item, props[key], sub)
            elif extra is False:
                lower = {k.lower(): k for k in props}
                guess = [lower[g] for g in difflib.get_close_matches(key.lower(), list(lower), 1)]
                hint = f"; did you mean `{guess[0]}`?" if guess else \
                    f"; the known fields are {', '.join(k for k in props if k != '$schema')}"
                out.append(f"`{sub}` is not a known field{hint}")
            elif isinstance(extra, dict):
                out += validate(item, extra, sub)
    return out


def _pattern_hint(path: str, value: str) -> str:
    if path == "reference" or path.endswith(".doi"):
        bare = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*)", "", value.strip(), flags=re.I)
        if bare != value and DOI.match(bare):
            return f"write the bare DOI, {_shown(bare)}"
        return "a DOI looks like 10.1103/PhysRevC.111.035802 (no https://doi.org/, no doi:)"
    if path.startswith("reactions"):
        return "write a reaction like \"¹²C(p,γ)¹³N\" (target(in,out)product, no spaces)"
    if path.startswith("atlas"):
        return "write an atlas page's file name without .yaml, like \"12C-pg-13N\""
    return "see app/info.schema.json"


# -- the .azr file ------------------------------------------------------------

_PATHISH = re.compile(r"[A-Za-z]")


def _block(text: str, name: str):
    """(first line number, lines) of ``<name>...</name>``, or (0, [])."""
    lines = text.split("\n")
    start = end = None
    for i, line in enumerate(lines):
        if line.strip() == f"<{name}>":
            start = i + 1
        elif line.strip() == f"</{name}>" and start is not None:
            end = i
            break
    if start is None or end is None:
        return 0, []
    return start + 1, lines[start:end]


def segment_files(text: str) -> List[str]:
    """The data files ``<segmentsData>`` reads, in order, as written."""
    out = []
    for _, line in _segment_lines(text):
        name = _segment_file(line)
        if name and name not in out:
            out.append(name)
    return out


def _segment_lines(text):
    first, lines = _block(text, "segmentsData")
    for i, line in enumerate(lines):
        if line.strip():
            yield first + i, line


def _segment_file(line: str) -> Optional[str]:
    """The data-file token of a segment line: the one that is not a number."""
    for token in line.split():
        if _PATHISH.search(token) and not re.match(r"^[-+]?[\d.]+(e[-+]?\d+)?$", token, re.I):
            return token
    return None


def azr_paths(text: str):
    """Every path the .azr file holds: (line number, kind, path).

    kinds: ``output`` and ``checks`` (``<config>``), ``data`` (a segment),
    ``lastrun`` (``<lastRun>``'s quoted files).
    """
    first, config = _block(text, "config")
    if len(config) > 2:
        yield first + 1, "output", config[1].split("#")[0].strip()
        yield first + 2, "checks", config[2].split("#")[0].strip()
    for number, line in _segment_lines(text):
        name = _segment_file(line)
        if name:
            yield number, "data", name
    first, last = _block(text, "lastRun")
    for i, line in enumerate(last):
        for quoted in re.findall(r'"([^"]+)"', line):
            yield first + i, "lastrun", quoted


def is_absolute(path: str) -> bool:
    return path.startswith(("/", "~", "\\")) or bool(re.match(r"^[A-Za-z]:[\\/]", path))


def stem(path: str) -> str:
    return os.path.splitext(os.path.basename(path.replace("\\", "/")))[0]


# -- the checks ---------------------------------------------------------------

def read_info(directory: str, problems: List[Problem], where: str) -> Optional[Dict]:
    path = os.path.join(directory, "info.json")
    if not os.path.isfile(path):
        problems.append(Problem("error", where, "there is no info.json; "
                                "`make add-evaluation` writes one to fill in"))
        return None
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    try:
        info = json.loads(raw)
    except json.JSONDecodeError as err:
        line = raw.split("\n")[err.lineno - 1] if err.lineno <= raw.count("\n") + 1 else ""
        problems.append(Problem(
            "error", where,
            f"is not valid JSON: {err.msg} at line {err.lineno}, column {err.colno}"
            f"{f': {line.strip()}' if line.strip() else ''}. Look for a doubled or "
            "missing comma, or a missing quote, there or on the line before"))
        return None
    if not isinstance(info, dict):
        problems.append(Problem("error", where, "must be an object { ... }"))
        return None
    return info


def atlas_links(reactions_dir: str = ATLAS_REACTIONS) -> Optional[Dict[str, List[str]]]:
    """Atlas reaction id -> its ``rmatrix:`` evaluation ids, or None without an atlas."""
    if not os.path.isdir(reactions_dir):
        return None
    out = {}
    for name in sorted(os.listdir(reactions_dir)):
        if not name.endswith(".yaml"):
            continue
        with open(os.path.join(reactions_dir, name), encoding="utf-8") as f:
            match = re.search(r"^rmatrix:\s*\[([^\]]*)\]", f.read(), re.M)
        ids = [s.strip().strip("'\"") for s in match.group(1).split(",")] if match else []
        out[name[:-5]] = [i for i in ids if i]
    return out


def check_evaluation(directory: str, schema: Optional[Dict] = None,
                     atlas: Optional[Dict[str, List[str]]] = None) -> List[Problem]:
    """Every problem with one evaluation directory."""
    schema = schema or load_schema()
    eid = os.path.basename(os.path.normpath(directory))
    problems: List[Problem] = []

    def error(where, message):
        problems.append(Problem("error", f"{eid}/{where}" if where else eid, message))

    def warn(where, message):
        problems.append(Problem("warning", f"{eid}/{where}" if where else eid, message))

    if not ID.match(eid):
        error("", "the directory name is the evaluation's id and its web address: "
                  "use letters, digits, - and _ only (e.g. 12C, 12C-2025)")

    azrs = sorted(n for n in os.listdir(directory) if n.endswith(".azr"))
    if not azrs:
        error("", "there is no .azr file in this directory")
    elif len(azrs) > 1:
        error("", f"there are {len(azrs)} .azr files ({', '.join(azrs)}); keep exactly one")

    files: List[str] = []
    if azrs:
        azr = azrs[0]
        with open(os.path.join(directory, azr), encoding="utf-8", errors="replace") as f:
            text = f.read()
        if not _block(text, "segmentsData")[1] and "<segmentsData>" not in text:
            error(azr, "has no <segmentsData> block: is it an AZURE2 file?")
        for number, kind, path in azr_paths(text):
            if is_absolute(path):
                error(f"{azr}:{number}", f"the {kind} path {_shown(path)} is absolute, so it only "
                      "works on the machine that wrote it; make it relative to the evaluation "
                      f"directory ({_shown(_relative_hint(kind, path))}). "
                      "`make add-evaluation` does this for you")
            elif kind == "data" and not os.path.isfile(os.path.join(directory, path)):
                error(f"{azr}:{number}", f"reads {_shown(path)}, which is not there; copy it "
                      "into data/ or fix the path")
        files = segment_files(text)

    info = read_info(directory, problems, f"{eid}/info.json")
    if info is not None:
        for message in validate(info, schema):
            error("info.json", message)
        for where, value in _todos(info):
            error("info.json", f"`{where}` still says {_shown(value)}: replace the TODO "
                  "(make add-evaluation leaves these for what only you know)")
        if "id" in info and info.get("id") != eid:
            error("info.json", f"`id` is {_shown(info.get('id'))} but the directory is {_shown(eid)}; "
                  "the directory name is the id, so make them the same (or remove `id`)")
        status = info.get("status")
        if status == "published" and not (isinstance(info.get("reference"), str) and info["reference"]):
            error("info.json", "`status` is \"published\" but there is no `reference` (the paper's DOI)")
        if status == "published" and not isinstance(info.get("paper"), dict):
            warn("info.json", "`status` is \"published\" but there is no `paper` "
                 "({\"authors\", \"title\", \"journal\", \"year\"}), so only the DOI is shown")
        datasets = info.get("datasets") if isinstance(info.get("datasets"), dict) else {}
        stems = [stem(f) for f in files]
        for key in datasets:
            if key not in stems:
                guess = difflib.get_close_matches(key, stems, 1)
                error("info.json", f"`datasets` names {_shown(key)}, but the model reads no data "
                      f"file called that{f'; did you mean {_shown(guess[0])}?' if guess else ''} "
                      f"(the key is the file name in data/ without .dat)")
        for s in stems:
            if s not in datasets:
                error("info.json", f"data file {_shown(s)} has no label: add "
                      f"\"{s}\": \"Author year\" (or {{\"label\", \"ref\", \"doi\"}}) to `datasets`")
        if atlas is not None and isinstance(info.get("atlas"), list):
            for rid in info["atlas"]:
                if isinstance(rid, str) and rid not in atlas:
                    guess = difflib.get_close_matches(rid, list(atlas), 1)
                    error("info.json", f"`atlas` lists {_shown(rid)}, but there is no "
                          f"content/atlas/reactions/{rid}.yaml"
                          f"{f'; did you mean {_shown(guess[0])}?' if guess else ''}")
        if atlas is not None and "atlas" not in info and \
                not any(eid in ids for ids in atlas.values()):
            warn("info.json", "no atlas page links to this evaluation: list the atlas pages it "
                 "belongs on in `atlas` (e.g. [\"12C-pg-13N\"]), or write \"atlas\": [] for none")

    if azrs:
        data_dir = os.path.join(directory, "data")
        used = {os.path.normpath(f) for f in files}
        if os.path.isdir(data_dir):
            unused = [n for n in sorted(os.listdir(data_dir)) if not n.startswith(".")
                      and os.path.normpath(os.path.join("data", n)) not in used]
            if unused:
                warn("data", "not read by the model (still shipped and downloadable): "
                     + ", ".join(unused))
        if not any(os.path.isfile(os.path.join(directory, "output", f"intEC.{x}"))
                   for x in ("dat", "extrap")):
            warn("output", "there is no output/intEC.dat: copy it from your AZURE2 run if the "
                 "model has external capture, or the first visitor waits while AZURE2 recomputes it")

    timings = os.path.join(directory, "timings.json")
    if not os.path.isfile(timings):
        warn("timings.json", "missing, so the page shows no \"opens in about N s\": run "
             "`make warm` (Docker) or `python -m app.warm <id>` (from server/) and commit it")
    else:
        try:
            with open(timings, encoding="utf-8") as f:
                stored = json.load(f)
            for side in ("server", "browser"):
                block = stored.get(side)
                if block is None:
                    continue
                bad = [k for k, v in block.items()
                       if k in TIMING_KEYS and not (isinstance(v, (int, float)) and v >= 0)]
                if bad or not isinstance(block, dict):
                    error("timings.json", f"`{side}` has non-numeric timings ({', '.join(bad)}); "
                          "write it again with `python -m app.warm --force <id>`")
        except (json.JSONDecodeError, AttributeError) as err:
            error("timings.json", f"is not valid ({err}); delete it and run "
                  "`python -m app.warm --force <id>`")
    return problems


TIMING_KEYS = ("open", "prepare_data", "prepare_fine", "prepare_extrap", "edit",
               "extrap_edit", "grid", "data", "fine")


def _todos(value, path=""):
    """(path, text) of every string that still holds a TODO placeholder."""
    if isinstance(value, str):
        if "TODO" in value:
            yield path or "info.json", value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield from _todos(item, f"{path}.{key}" if path else key)
    elif isinstance(value, list):
        for i, item in enumerate(value):
            yield from _todos(item, f"{path}[{i}]")


def _relative_hint(kind: str, path: str) -> str:
    return {"output": "output/", "checks": "checks/"}.get(
        kind, f"{'data' if kind == 'data' else 'output'}/{os.path.basename(path.replace(chr(92), '/'))}")


def check_root(root: str, only: Iterable[str] = (), atlas_dir: str = ATLAS_REACTIONS) -> List[Problem]:
    """Every problem under ``root`` (only the ids in ``only``, when given)."""
    schema = load_schema()
    atlas = atlas_links(atlas_dir)
    only = set(only)
    problems: List[Problem] = []
    ids = []
    for name in sorted(os.listdir(root)):
        directory = os.path.join(root, name)
        if not os.path.isdir(directory) or name.startswith((".", "_")):
            continue
        ids.append(name)
        if only and name not in only:
            continue
        problems += check_evaluation(directory, schema, atlas)
    for name in sorted(only - set(ids)):
        problems.append(Problem("error", name, f"there is no directory {name} in {root}"))
    if atlas is not None and not only:
        for rid, evs in atlas.items():
            for ev in evs:
                if ev not in ids:
                    guess = difflib.get_close_matches(ev, ids, 1)
                    problems.append(Problem(
                        "error", f"content/atlas/reactions/{rid}.yaml",
                        f"`rmatrix:` lists {_shown(ev)}, which is not an evaluation"
                        f"{f'; did you mean {_shown(guess[0])}?' if guess else ''} "
                        "(ids are case-sensitive)"))
    return problems


def log_problems(root: str) -> None:
    """Log every problem at server start-up (never raises)."""
    try:
        for problem in check_root(root):
            (log.error if problem.level == "error" else log.info)("evaluation check: %s", problem)
    except Exception as err:          # a checker bug must not stop the server
        log.warning("evaluation check failed to run: %s", err)


def report(problems: List[Problem], out=sys.stdout) -> int:
    """Print errors first, then warnings; return the exit status."""
    errors = [p for p in problems if p.level == "error"]
    warnings = [p for p in problems if p.level != "error"]
    for p in errors + warnings:
        print(p, file=out)
    if errors:
        print(f"\n{len(errors)} error(s), {len(warnings)} warning(s). Fix the errors above "
              "(docs/ADDING-AN-EVALUATION.md explains every field).", file=out)
        return 1
    print(f"evaluations OK ({len(warnings)} warning(s))", file=out)
    return 0


if __name__ == "__main__":
    sys.path.insert(0, os.path.join(HERE, ".."))
    from config import Config
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("only", nargs="*", help="evaluation ids (default: all)")
    parser.add_argument("--root", default=Config.EVALUATIONS_DIR)
    parser.add_argument("--atlas", default=ATLAS_REACTIONS,
                        help="content/atlas/reactions (skipped when absent)")
    a = parser.parse_args()
    sys.exit(report(check_root(a.root, a.only, a.atlas)))

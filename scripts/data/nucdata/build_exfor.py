"""EXFOR -> the explorer's index and per-reaction shards.

    python scripts/data/dx.py build-exfor [--source DIR] [--only atlas|all]
                                          [--entries O1195,D4400] [--jobs N]

Pass 1 parses every entry (in parallel), keeps the datasets in scope and
appends each, as one JSON line, to build/dx/rx/<slug>.jsonl; the index row
is kept in memory.  Pass 2 turns each reaction's lines into a shard,
decimating or paging it when it exceeds the budget, and writes the index and
meta.json.

Outputs (public/data/, documented in scripts/data/README.md):
  meta.json                     sources, snapshot, licences, citations, counts
  exfor/index.json              compact columnar index of every dataset in scope
  exfor/r/<slug>.json           one shard per reaction (metadata + points)
  exfor/r/<slug>/<n>.json       further pages of a paged shard
  exfor/sets/<entry>/<id>.json.gz  full-resolution points of a decimated dataset (gzip)
"""

import gzip
import json
import os
import shutil
import sys
import time
from collections import defaultdict
from multiprocessing import Pool
from typing import Dict, List, Optional

from . import config, dataset, x4
from .scope import SLICES, atlas_reactions, slices
from .source import open_source, update_dates

FLAG_BITS = ["has-extrapolated-rows", "digitised", "superseded", "deleted", "preliminary",
             "relative", "not-experimental", "derived", "complex", "cm_approx",
             "outdated-normalisation", "renormalised-by-compiler", "dependent", "upper-limits",
             "indirect", "corrected"]
ERR_BITS = ["stat", "sys", "total-given", "total-combined", "normalisation"]
QCLASSES = list(dataset.QUANTITY_CLASSES)
SLICE_BITS = list(SLICES)


def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def gz_size(text: str) -> int:
    return len(gzip.compress(text.encode(), 6))


_UPDATES: Dict = {}


def _init(updates):
    global _UPDATES
    _UPDATES = updates


def _process(args):
    eid, text = args
    out = []
    try:
        entry = x4.parse_entry(text, eid)
        for ds in dataset.datasets(entry, _UPDATES.get(eid)):
            p = x4.Primitive(*ds.meta["sf"][0])
            sl = slices(p)
            if sl:
                ds.meta["slices"] = sl
                out.append((ds.meta, ds.points, ds.excluded))
    except Exception as exc:  # one broken entry must not stop the build
        return eid, out, f"{type(exc).__name__}: {exc}"
    return eid, out, None


def links(meta: dict, src: dict) -> dict:
    e = meta["entry"]
    return {"exfor": src["entry_url"].format(entry=e),
            "master": src["blob_url"].format(commit=src["commit"], dir=e[:3], entry=e)}


def index_row(meta: dict, strings: Dict[str, Dict[str, int]]) -> dict:
    def sid(table, value):
        t = strings[table]
        if value not in t:
            t[value] = len(t)
        return t[value]

    flags = 0
    fl = set(meta["flags"])
    if meta["complex"]:
        fl.add("complex")
    if meta["cm_approx"]:
        fl.add("cm_approx")
    for i, name in enumerate(FLAG_BITS):
        if name in fl:
            flags |= 1 << i
    err = 0
    kinds = {c["kind"] for c in meta["err_components"]}
    if "stat" in kinds:
        err |= 1
    if "sys" in kinds:
        err |= 2
    src = meta["d_tot_source"] or ""
    if src and not src.startswith("combined"):
        err |= 4
    elif src:
        err |= 8
    if any(c["where"] == "common" and c["kind"] in ("sys", "total") for c in meta["err_components"]):
        err |= 16
    sl = 0
    for i, s in enumerate(SLICE_BITS):
        if s in meta["slices"]:
            sl |= 1 << i
    inst = meta["institutes"][0]["code"] if meta["institutes"] else ""
    fac = meta["facility"][0]["code"] + ("," + meta["facility"][0]["institute"] if meta["facility"][0]["institute"] else "") \
        if meta["facility"] else ""
    r6 = lambda v: None if v is None else float(f"{v:.6g}")
    return {
        "id": meta["id"],
        "r": sid("reactions", meta["reaction"]),
        "q": QCLASSES.index(meta["quantity_class"]),
        "qs": sid("quantities", meta["quantity"]),
        "fr": ["lab", "cm", "lab-res", "cm-res", None].index(meta["E_frame"]),
        "e0": r6(meta["emin_cm"]),
        "e1": r6(meta["emax_cm"]),
        "k0": r6(meta["kt_min"]),
        "k1": r6(meta["kt_max"]),
        "n": meta["npts"],
        "y": meta["year"],
        "a": sid("authors", meta["first_author"] + ("+" if len(meta["authors"]) > 1 else "")),
        "i": sid("institutes", inst),
        "fa": sid("facilities", fac),
        "f": flags,
        "er": err,
        "lv": len(meta["final_levels"]),
        "s": sl,
        "u": (meta["entry_updated"] or "").replace("-", ""),
        # lowest E_cm (MeV) of a measured point at 1 and 2 standard deviations
        # (nucdata/measured.py), compactly: 0 = the same as e0 (m2) or m2 (m1)
        **measured_columns(r6(meta["emin_cm"]), r6(meta["measured_min_cm"]["1sigma"]),
                           r6(meta["measured_min_cm"]["2sigma"])),
    }


def measured_columns(e0, m1, m2) -> dict:
    """Index columns m1, m2: null (no measured point), 0 (m2 = e0; m1 = m2) or the energy (MeV).
    lib/data/lowest.mjs indexRows decodes them."""
    c2 = None if m2 is None else (0 if m2 == e0 else m2)
    c1 = None if m1 is None else (0 if m1 == m2 else m1)
    return {"m1": c1, "m2": c2}


def _decimate(points: dict, keep: int):
    n = len(points["value"])
    if n <= keep:
        return points
    def energy(i):
        for k in ("E_cm", "E_lab", "kT"):
            v = (points.get(k) or [None] * n)[i]
            if v is not None:
                return v
        return 0.0
    order = sorted(range(n), key=lambda i: (energy(i), i))
    step = (n - 1) / (keep - 1)
    picked = sorted({order[round(k * step)] for k in range(keep)})

    def sub(v):
        if isinstance(v, dict):
            return {k: sub(x) for k, x in v.items()}
        if isinstance(v, list):
            return [v[i] for i in picked]
        return v
    return sub(points)


def write_json(path: str, obj, gz: bool = False) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    text = dumps(obj)
    if gz:
        with gzip.open(path, "wt", compresslevel=9) as f:
            f.write(text)
        return os.path.getsize(path)
    with open(path, "w") as f:
        f.write(text)
    return len(text)


# Bibliographic fields shared by the datasets of one EXFOR entry: stored once
# per shard in `entries`, and only where a subentry differs in the dataset's
# own meta (store.merged() puts them back together).
ENTRY_KEYS = ["authors", "first_author", "title", "refs", "doi", "institutes", "facility", "methods",
              "detectors", "entry_date", "entry_updated", "entry_revisions", "year", "entry_history",
              "entry_status"]


def split_entry(meta: dict, entries: Dict[str, dict]) -> dict:
    e = meta["entry"]
    common = {k: meta[k] for k in ENTRY_KEYS}
    if e not in entries:
        entries[e] = dict(common, links=links(meta, _SRC))
    own = {k: v for k, v in meta.items() if k not in ENTRY_KEYS or entries[e].get(k) != v}
    return own


_SRC: dict = {}


def build_shard(slug: str, key: str, lines: List[str], out_dir: str, src: dict, atlas: Dict[str, List[str]],
                stats: dict) -> dict:
    global _SRC
    _SRC = src
    sets = [json.loads(l) for l in lines]
    sets.sort(key=lambda d: (d["meta"]["year"] or 0, d["meta"]["id"]))
    first = sets[0]["meta"]
    reaction = {"key": key, "slug": slug, "target": first["target"], "projectile": first["projectile"],
                "process": first["process"], "compound": first["compound"],
                "atlas": atlas.get(key, [])}
    entries: Dict[str, dict] = {}
    full = []
    for d in sets:
        full.append({"meta": split_entry(d["meta"], entries), "points": d["points"], "excluded": d["excluded"],
                     "_full_meta": d["meta"]})
    shard = {"schema": "dx-exfor-shard", "schema_version": config.SCHEMA["shard"],
             "reaction": reaction, "entries": entries, "datasets": []}
    budget = config.BUDGET["shard_gz"]
    strip = lambda d: {k: v for k, v in d.items() if k != "_full_meta"}
    shard["datasets"] = [strip(d) for d in full]
    text = dumps(shard)
    if gz_size(text) <= budget:
        write_json(os.path.join(out_dir, "r", f"{slug}.json"), shard)
        stats["shard_gz"].append(gz_size(text))
        stats["bytes"] += len(text)
        return shard
    # Decimate the large datasets; the full ones go beside, gzipped (they are
    # downloads, not what the page draws).
    keep = config.BUDGET["shard_points_decimated"]
    dec = []
    for d in full:
        n = len(d["points"]["value"])
        if n > keep:
            path = f"sets/{d['meta']['entry']}/{d['meta']['id']}.json.gz"
            stats["bytes"] += write_json(os.path.join(out_dir, path), {
                "schema": "dx-exfor-set", "schema_version": config.SCHEMA["set"],
                "id": d["meta"]["id"], "reaction": key, "meta": d["_full_meta"],
                "points": d["points"], "excluded": d["excluded"]}, gz=True)
            stats["sets"] += 1
            dd = strip(d)
            dd["points"] = _decimate(d["points"], keep)
            dd["decimated"] = {"total": n, "kept": len(dd["points"]["value"]), "full": path}
            dec.append(dd)
        else:
            dec.append(strip(d))
    shard["datasets"] = dec
    text = dumps(shard)
    if gz_size(text) <= budget:
        write_json(os.path.join(out_dir, "r", f"{slug}.json"), shard)
        stats["shard_gz"].append(gz_size(text))
        stats["decimated"] += 1
        stats["bytes"] += len(text)
        return shard
    # Page it: the first file lists every dataset's metadata; the points live
    # in pages of about the budget each.
    pages, cur, cur_size = [], [], 0
    for d in dec:
        s = gz_size(dumps(d["points"])) + 200
        if cur and cur_size + s > budget * 0.9:
            pages.append(cur)
            cur, cur_size = [], 0
        cur.append(d)
        cur_size += s
    if cur:
        pages.append(cur)
    head = []
    for n, page in enumerate(pages, start=1):
        path = f"r/{slug}/{n}.json"
        stats["bytes"] += write_json(os.path.join(out_dir, path), {
            "schema": "dx-exfor-page", "schema_version": config.SCHEMA["shard"], "reaction": key,
            "page": n, "datasets": [{"id": d["meta"]["id"], "points": d["points"], "excluded": d["excluded"],
                                     **({"decimated": d["decimated"]} if "decimated" in d else {})}
                                    for d in page]})
        for d in page:
            h = {"meta": d["meta"], "page": path}
            if "decimated" in d:
                h["decimated"] = d["decimated"]
            head.append(h)
    shard["datasets"] = head
    shard["pages"] = [f"r/{slug}/{n}.json" for n in range(1, len(pages) + 1)]
    text = dumps(shard)
    write_json(os.path.join(out_dir, "r", f"{slug}.json"), shard)
    stats["shard_gz"].append(gz_size(text))
    stats["paged"] += 1
    stats["bytes"] += len(text)
    return shard


MONTHS = {"en": ["January", "February", "March", "April", "May", "June", "July", "August", "September",
                  "October", "November", "December"],
          "it": ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre",
                 "ottobre", "novembre", "dicembre"]}


def long_date(iso: str, lang: str) -> str:
    """2026-09-28 -> 28 September 2026 / 28 settembre 2026 (docs/STYLE.md)."""
    y, m, d = (int(x) for x in iso.split("-"))
    return f"{d} {MONTHS[lang][m - 1]} {y}"


def it_del(date: str) -> str:
    """del 28 settembre, dell'1 / dell'8 / dell'11 settembre."""
    return f"dell'{date}" if date.split(" ")[0] in ("1", "8", "11") else f"del {date}"


def meta_document(src_all: dict, counts: dict, generated: str) -> dict:
    ex = src_all["exfor_master"]
    return {
        "schema": "dx-meta", "schema_version": config.SCHEMA["meta"],
        "generated": generated,
        "schemas": config.SCHEMA,
        "exfor": {
            "name": "EXFOR (IAEA Nuclear Data Section and the NRDC network)",
            "repository": ex["repo"].removesuffix(".git"),
            "commit": ex["commit"],
            "release_tag": ex["release_tag"],
            "snapshot_date": ex["snapshot_date"],
            "license": "CC BY 4.0",
            "license_url": "https://creativecommons.org/licenses/by/4.0/",
            "entry_url": ex["entry_url"],
            "master_url": ex["blob_url"],
            "line": f"Data: EXFOR (IAEA/NRDC), snapshot of {long_date(ex['snapshot_date'], 'en')}, CC BY 4.0",
            "line_it": f"Dati: EXFOR (IAEA/NRDC), versione {it_del(long_date(ex['snapshot_date'], 'it'))}, CC BY 4.0",
            "changes": ("Converted from the EXFOR exchange format to JSON: units normalised (MeV, b, "
                        "b/sr, MeV b, deg), lab and c.m. energies both computed with AME2020 masses, "
                        "rows flagged as extrapolated removed from the points and listed separately, "
                        "large datasets decimated for display with the full set beside, and the frame, unit and "
                        "scale errors listed in scripts/data/corrections.yaml corrected (each such dataset is "
                        "flagged 'corrected' and says what was changed)."),
            "citation": ("N. Otuka et al., \"Towards a More Complete and Accurate Experimental Nuclear "
                         "Reaction Data Library (EXFOR): International Collaboration Between Nuclear "
                         "Reaction Data Centres (NRDC)\", Nucl. Data Sheets 120, 272 (2014), "
                         "doi:10.1016/j.nds.2014.07.065"),
            "dictionary": {"repository": src_all["exfor_dictionary"]["repo"].removesuffix(".git"),
                           "commit": src_all["exfor_dictionary"]["commit"], "license": "MIT"},
            "parser": "scripts/data (this site's own reader; exforparser is not used)",
        },
        "masses": {"name": "AME2020", "citation": "M. Wang et al., Chin. Phys. C 45, 030003 (2021)",
                   "file": "content/atlas/nuclear-data/ame2020-mass-excess.txt"},
        "scope": SLICES,
        "counts": counts,
        "files": {
            "index": "exfor/index.json",
            "shard": "exfor/r/{slug}.json",
            "page": "exfor/r/{slug}/{n}.json",
            "set": "exfor/sets/{entry}/{id}.json.gz",
            "ensdf": "ensdf/{nuclide}.json",
            "ensdf_list": "ensdf/index.json",
        },
        "flags": {"bits": FLAG_BITS, "err_bits": ERR_BITS, "quantity_classes": dataset.QUANTITY_CLASSES,
                  "slices": SLICE_BITS, "frames": ["lab", "cm", "lab-res", "cm-res", None]},
    }


def run(argv: Optional[List[str]] = None):
    import argparse
    ap = argparse.ArgumentParser(prog="dx.py build-exfor")
    ap.add_argument("--source", help="exfor_master git dir or checkout (default build/dx/exfor_master.git)")
    ap.add_argument("--out", default=config.OUT_DIR)
    ap.add_argument("--work", default=os.path.join(config.CACHE_DIR, "rx"))
    ap.add_argument("--entries", help="comma-separated entries only (for tests)")
    ap.add_argument("--shards", choices=["all", "atlas", "none"], default="all",
                    help="which reaction shards to write (the index always covers the whole scope)")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    args = ap.parse_args(argv)

    t0 = time.time()
    src_all = config.sources()
    exsrc = src_all["exfor_master"]
    source = open_source(args.source)
    updates = update_dates(source)
    only = set(args.entries.split(",")) if args.entries else None
    atlas = atlas_reactions()

    if os.path.isdir(args.work):
        shutil.rmtree(args.work)
    os.makedirs(args.work)
    out_exfor = os.path.join(args.out, "exfor")
    for sub in ("r", "sets"):
        if os.path.isdir(os.path.join(out_exfor, sub)):
            shutil.rmtree(os.path.join(out_exfor, sub))
    os.makedirs(out_exfor, exist_ok=True)

    strings = {"reactions": {}, "quantities": {}, "authors": {}, "institutes": {}, "facilities": {}}
    rows, errors = [], []
    slug_of: Dict[str, str] = {}
    n_entries = n_points = n_excl = 0
    with Pool(args.jobs, initializer=_init, initargs=(updates,)) as pool:
        for eid, found, err in pool.imap_unordered(_process, source.entries(only), chunksize=16):
            n_entries += 1
            if err:
                errors.append((eid, err))
            for meta, points, excluded in found:
                key = meta["reaction"]
                if key not in slug_of:
                    slug = dataset.reaction_slug(key)
                    if slug in slug_of.values():
                        slug = f"{slug}-{len(slug_of)}"
                    slug_of[key] = slug
                rows.append(index_row(meta, strings))
                n_points += meta["npts"]
                n_excl += meta["nexcluded"]
                with open(os.path.join(args.work, slug_of[key] + ".jsonl"), "a") as f:
                    f.write(dumps({"meta": meta, "points": points, "excluded": excluded}) + "\n")
    t1 = time.time()
    print(f"pass 1: {n_entries} entries, {len(rows)} datasets in scope, {n_points} points, "
          f"{n_excl} rows excluded, {len(errors)} entries with errors, {t1 - t0:.0f} s", file=sys.stderr)
    for eid, err in errors[:20]:
        print(f"  {eid}: {err}", file=sys.stderr)

    # -- pass 2: shards ------------------------------------------------------
    stats = {"shard_gz": [], "decimated": 0, "paged": 0, "sets": 0, "bytes": 0}
    want = set(slug_of) if args.shards == "all" else (set(atlas) & set(slug_of) if args.shards == "atlas" else set())
    for key in sorted(want):
        slug = slug_of[key]
        path = os.path.join(args.work, slug + ".jsonl")
        with open(path) as f:
            build_shard(slug, key, f.read().splitlines(), out_exfor, exsrc, atlas, stats)
        os.remove(path)   # keeps the peak disk use near the size of the output
    t2 = time.time()
    if args.shards != "all":
        # The committed meta.json describes the index, not a partial set of
        # shards: the same index gives the same meta whichever shards were built.
        print(f"shards (not recorded in meta.json): {len(stats['shard_gz'])} written, "
              f"{stats['decimated']} decimated, {stats['paged']} paged, {stats['sets']} full sets", file=sys.stderr)
        stats = {"shard_gz": [], "decimated": 0, "paged": 0, "sets": 0, "bytes": 0}

    # -- index ---------------------------------------------------------------
    rows.sort(key=lambda r: r["id"])
    rkeys = sorted(strings["reactions"], key=lambda k: strings["reactions"][k])
    per_r = defaultdict(int)
    for r in rows:
        per_r[r["r"]] += 1
    reactions = {"key": rkeys, "slug": [slug_of[k] for k in rkeys],
                 "n": [per_r[i] for i in range(len(rkeys))],
                 "atlas": [atlas.get(k, []) for k in rkeys]}
    cols = list(rows[0].keys()) if rows else []
    # No wall-clock dates or timings in the files: the same snapshot and code
    # give byte-identical output.
    generated = f"exfor_master {exsrc['commit'][:10]} ({exsrc['snapshot_date']})"
    index = {
        "schema": "dx-exfor-index", "schema_version": config.SCHEMA["index"],
        "generated": generated,
        "snapshot": {"commit": exsrc["commit"], "date": exsrc["snapshot_date"]},
        "reactions": reactions,
        "strings": {k: sorted(v, key=lambda s: v[s]) for k, v in strings.items() if k != "reactions"},
        "columns": cols,
        "datasets": {c: [r[c] for r in rows] for c in cols},
    }
    text = dumps(index)
    with open(os.path.join(out_exfor, "index.json"), "w") as f:
        f.write(text)
    index_gz = gz_size(text)
    counts = {
        "entries_scanned": n_entries, "datasets": len(rows), "entries": len({r["id"][:5] for r in rows}),
        "points": n_points, "excluded_rows": n_excl, "reactions": len(rkeys),
        "per_slice": {s: sum(1 for r in rows if r["s"] & (1 << i)) for i, s in enumerate(SLICE_BITS)},
        "shards_written": len(stats["shard_gz"]), "shards_decimated": stats["decimated"],
        "shards_paged": stats["paged"], "full_sets": stats["sets"],
        "index_bytes": len(text), "index_gz_bytes": index_gz,
        "shard_gz_median": sorted(stats["shard_gz"])[len(stats["shard_gz"]) // 2] if stats["shard_gz"] else None,
        "shard_gz_max": max(stats["shard_gz"]) if stats["shard_gz"] else None,
        "output_bytes": stats["bytes"] + len(text),
        "parse_errors": len(errors),
    }
    meta = meta_document(src_all, counts, generated)
    meta_path = os.path.join(args.out, "meta.json")
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            old = json.load(f)
        if "ensdf" in old:
            meta["ensdf"] = old["ensdf"]
    with open(meta_path, "w") as f:
        f.write(json.dumps(meta, ensure_ascii=False, indent=1))
    print(json.dumps(counts, indent=1), file=sys.stderr)
    print(f"timings: pass 1 {t1 - t0:.0f} s, pass 2 {t2 - t1:.0f} s", file=sys.stderr)
    shutil.rmtree(args.work, ignore_errors=True)
    return counts

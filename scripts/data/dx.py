#!/usr/bin/env python3
"""The nuclear data explorer's data pipeline (see scripts/data/README.md).

    python scripts/data/dx.py fetch-exfor              clone exfor_master at the pinned commit
    python scripts/data/dx.py build-exfor [--shards all|atlas|none]
    python scripts/data/dx.py fetch-ensdf [--record]   NNDC ENSDF archive (mirror as fallback)
    python scripts/data/dx.py build-ensdf [--set atlas|scope]
    python scripts/data/dx.py export ID[,ID...] --format azure2|csv|json|bibtex --out DIR
    python scripts/data/dx.py dictionary LATEST_JSON   refresh the vendored EXFOR dictionary subset
    python scripts/data/dx.py check                    schema and size-budget checks of public/data
    python scripts/data/dx.py nrdc-report              write scripts/data/nrdc-report.md from corrections.yaml
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd, rest = argv[0], argv[1:]
    if cmd == "fetch-exfor":
        from nucdata import source
        print(source.fetch(rest[0] if rest else None))
    elif cmd == "build-exfor":
        from nucdata import build_exfor
        build_exfor.run(rest)
    elif cmd == "fetch-ensdf":
        from nucdata import fetch_ensdf
        fetch_ensdf.run(rest)
    elif cmd == "build-ensdf":
        from nucdata import build_ensdf
        build_ensdf.run(rest)
    elif cmd == "export":
        from nucdata import export
        export.run(rest)
    elif cmd == "dictionary":
        import json
        from nucdata import config, dictionary
        commit = rest[1] if len(rest) > 1 else config.sources()["exfor_dictionary"]["commit"]
        subset = dictionary.build_subset(rest[0], commit)
        with open(config.DICTIONARY_SUBSET, "w") as f:
            json.dump(subset, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    elif cmd == "nrdc-report":
        from nucdata import corrections
        with open(corrections.REPORT, "w") as f:
            f.write(corrections.report())
        print(corrections.REPORT)
    elif cmd == "check":
        from nucdata import check
        return check.run(rest)
    else:
        print(f"unknown command {cmd}\n{__doc__}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

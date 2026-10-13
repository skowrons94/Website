"""Where the EXFOR master files are read from.

Two forms, both pinned to the commit in sources.json:

* a git repository (bare or not) holding that commit — what `dx.py
  fetch-exfor` makes, with `git clone --bare --depth 1` plus a fetch of the
  pinned commit.  Files are streamed with `git cat-file --batch`, so the
  1.2 GB of .x4 text never has to be checked out;
* a plain directory with exforall/<3 chars>/<entry>.x4 (any checkout).

Both also give entry_updatedate.dat (<entry> <last-update> <revisions> <blob>).
"""

import os
import subprocess
from typing import Dict, Iterator, Optional, Tuple

from . import config


class GitSource:
    def __init__(self, repo: str, commit: str):
        self.repo, self.commit = repo, commit
        out = subprocess.run(["git", "-C", repo, "cat-file", "-t", commit],
                             capture_output=True, text=True)
        if out.returncode != 0 or out.stdout.strip() != "commit":
            raise SystemExit(f"{repo} does not hold commit {commit}; run dx.py fetch-exfor")

    def read(self, path: str) -> str:
        return subprocess.run(["git", "-C", self.repo, "show", f"{self.commit}:{path}"],
                              capture_output=True, check=True).stdout.decode("latin-1")

    def entries(self, only: Optional[set] = None) -> Iterator[Tuple[str, str]]:
        """(entry id, text) for every exforall/**/*.x4 (or those in only)."""
        ls = subprocess.run(["git", "-C", self.repo, "ls-tree", "-r", self.commit, "exforall"],
                            capture_output=True, text=True, check=True).stdout
        blobs = []
        for line in ls.splitlines():
            meta, path = line.split("\t", 1)
            if not path.endswith(".x4"):
                continue
            eid = os.path.basename(path)[:-3]
            if only is not None and eid not in only:
                continue
            blobs.append((eid, meta.split()[2]))
        proc = subprocess.Popen(["git", "-C", self.repo, "cat-file", "--batch"],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        try:
            for eid, sha in blobs:
                proc.stdin.write(sha.encode() + b"\n")
                proc.stdin.flush()
                header = proc.stdout.readline().split()
                size = int(header[2])
                data = proc.stdout.read(size)
                proc.stdout.read(1)
                yield eid, data.decode("latin-1")
        finally:
            proc.stdin.close()
            proc.wait()


class DirSource:
    def __init__(self, root: str):
        self.root = root

    def read(self, path: str) -> str:
        with open(os.path.join(self.root, path), encoding="latin-1") as f:
            return f.read()

    def entries(self, only: Optional[set] = None) -> Iterator[Tuple[str, str]]:
        base = os.path.join(self.root, "exforall")
        for d in sorted(os.listdir(base)):
            for fn in sorted(os.listdir(os.path.join(base, d))):
                if fn.endswith(".x4") and (only is None or fn[:-3] in only):
                    with open(os.path.join(base, d, fn), encoding="latin-1") as f:
                        yield fn[:-3], f.read()


def open_source(path: Optional[str] = None):
    """A GitSource at the pinned commit for a git directory, else a DirSource."""
    src = config.sources()["exfor_master"]
    path = path or os.environ.get("EXFOR_MASTER") or os.path.join(config.CACHE_DIR, "exfor_master.git")
    if os.path.isdir(os.path.join(path, "exforall")) and not os.path.exists(os.path.join(path, ".git")):
        return DirSource(path)
    return GitSource(path, src["commit"])


def update_dates(source) -> Dict[str, Tuple[str, int]]:
    out = {}
    for line in source.read("entry_updatedate.dat").splitlines():
        parts = line.split()
        if len(parts) >= 3 and parts[2].isdigit():
            out[parts[0]] = (parts[1], int(parts[2]))
    return out


def fetch(dest: Optional[str] = None) -> str:
    """Bare, shallow clone of exfor_master holding exactly the pinned commit."""
    src = config.sources()["exfor_master"]
    dest = dest or os.path.join(config.CACHE_DIR, "exfor_master.git")
    if not os.path.isdir(dest):
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        subprocess.run(["git", "init", "--bare", "-q", dest], check=True)
        subprocess.run(["git", "-C", dest, "remote", "add", "origin", src["repo"]], check=True)
    have = subprocess.run(["git", "-C", dest, "cat-file", "-t", src["commit"]], capture_output=True, text=True)
    if have.stdout.strip() != "commit":
        subprocess.run(["git", "-C", dest, "fetch", "-q", "--depth", "1", "origin", src["commit"]], check=True)
    return dest

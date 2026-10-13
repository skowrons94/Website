"""Discovery of the evaluations served by this instance.

An evaluation is just a directory containing one ``.azr`` file, alongside the
``data/``, ``output/`` and ``checks/`` directories AZURE2 itself uses, and an
``info.json`` with what a file cannot know: who produced it, what to cite, a
readable name for each data file, the one-line purpose shown on its card.
There is no registry to update.

``make add-evaluation`` creates such a directory from an ``.azr`` file; the
fields of ``info.json`` are defined in ``app/info.schema.json`` and explained
in docs/ADDING-AN-EVALUATION.md, and ``python -m app.check`` (or ``npm run
check:evaluations``) checks them.  Here the file is read leniently -- an
evaluation with a broken or missing ``info.json`` is still served, without its
citation -- so that one mistake never takes the model offline; the check, the
server's start-up log and the build report it instead.

``paper.authors`` are the paper's authors as cited (first author et al.);
``analysis`` is who did the R-matrix analysis, which need not be the same
person.  The older single ``author`` field is still read, as ``analysis``.
``title``, ``channels`` and ``reactions`` override the values derived from the
model.  ``datasets`` names data files by stem, as
``{"label", "authors", "ref", "doi"}`` (or ``"pending"`` instead of ``ref``;
a bare string is still read, but the check refuses it); unlisted files are
named by :func:`dataset_label`.
"""

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import re

from app.labels import (ChannelLabel, compound_nucleus, entrance_key,
                        labels_from_file, reactions)

log = logging.getLogger(__name__)


@dataclass
class Evaluation:
    """One evaluation directory, described without launching AZURE2."""

    id: str                       # directory name, e.g. '13N'
    path: str                     # absolute path to the directory
    azr_path: str                 # absolute path to the .azr file
    title: str                    # LaTeX, e.g. '^{13}\\text{N}'
    channels: List[str]           # LaTeX channel labels, by pair number
    author: Optional[str] = None
    reference: Optional[str] = None
    labels: List[ChannelLabel] = field(default_factory=list)
    entrance_key: Optional[int] = None
    reactions: List[str] = field(default_factory=list)
    info: Dict = field(default_factory=dict)

    @property
    def doi(self) -> Optional[str]:
        """The reference, when it is a DOI (``10.xxxx/...``)."""
        return _bare_doi(self.reference)

    def _dataset_entry(self, data_file: str):
        stem = os.path.splitext(os.path.basename(data_file or ""))[0]
        names = self.info.get("datasets")
        entry = names.get(stem) if isinstance(names, dict) else None
        return stem, entry

    def dataset_label(self, data_file: str) -> str:
        """Readable name for a data file, from ``info.json`` or the file name."""
        stem, entry = self._dataset_entry(data_file)
        if isinstance(entry, str) and entry.strip():
            return entry
        if isinstance(entry, dict) and _text(entry.get("label")):
            return entry["label"]
        return dataset_label(stem)

    def dataset_source(self, data_file: str) -> Dict:
        """``{"authors", "ref", "doi", "pending"}`` of a data file, where
        ``info.json`` gives them (``pending``: true when the publication is
        not known yet)."""
        _, entry = self._dataset_entry(data_file)
        if not isinstance(entry, dict):
            return {"authors": None, "ref": None, "doi": None, "pending": False}
        return {"authors": _text(entry.get("authors")), "ref": _text(entry.get("ref")),
                "doi": _bare_doi(entry.get("doi")),
                "pending": bool(_text(entry.get("pending"))) and not _text(entry.get("ref"))}

    @property
    def entrance_label(self) -> Optional[ChannelLabel]:
        return next((c for c in self.labels if c.number == self.entrance_key),
                    None)

    @property
    def azr_filename(self) -> str:
        return os.path.basename(self.azr_path)

    def to_dict(self) -> Dict:
        entrance = self.entrance_label
        info = self.info
        return {
            "id": self.id,
            "title": self.title,
            "channels": self.channels,
            "author": self.author,
            "reference": self.reference,
            "doi": self.doi,
            "filename": self.azr_filename,
            "entrance": entrance.reaction if entrance else None,
            "reactions": self.reactions,
            "status": _text(info.get("status")),
            "analysis": self.author,
            "paper": info.get("paper") if isinstance(info.get("paper"), dict) else None,
            "citation": _text(info.get("citation")),
            "summary": _text(info.get("summary")),
            "summary_it": _text(info.get("summary_it")),
            "purpose": _text(info.get("purpose")),
            "purpose_it": _text(info.get("purpose_it")),
        }


def _text(value) -> Optional[str]:
    return value if isinstance(value, str) and value.strip() else None


def _bare_doi(value) -> Optional[str]:
    """``10.xxxx/...`` from a DOI written bare, as ``doi:...`` or as a doi.org
    link; None when it is not a DOI (so no broken link is drawn)."""
    ref = (value or "").strip() if isinstance(value, str) else ""
    ref = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*)", "", ref, flags=re.I)
    return ref if re.match(r"^10\.\d{4,9}/\S+$", ref) else None


# EXFOR entry + subentry, as data files exported from EXFOR are often named:
# ``Elwyn-F0012002`` is entry F0012, subentry 002.
_EXFOR = re.compile(r"^([A-Z0-9]\d{4})(\d{3})$")
# Words in file names that are acronyms or abbreviations, not surnames.
_WORDS = {"luna": "LUNA", "tunl": "TUNL", "bgo": "BGO", "hpge": "HPGe",
          "fels": "Felsenkeller", "gs": "g.s.", "fes": "1st exc.",
          "total": "total"}
# Reaction tags in file names (``Lambert_pp``): the segment states its
# reaction itself, so these add nothing to the name.
_REACTION_TAGS = {"pp", "pg", "pa", "aa", "ag", "pn", "an"}


def exfor_code(stem: str) -> Optional[str]:
    """``'F0012.002'`` for a stem ending in an EXFOR entry number, else None."""
    for token in re.split(r"[-_]", stem):
        match = _EXFOR.match(token)
        if match:
            return f"{match.group(1)}.{match.group(2)}"
    return None


def dataset_label(stem: str) -> str:
    """A readable name derived from a data file's stem.

    ``kettner_0`` -> ``Kettner``; ``Elwyn-F0012002`` -> ``Elwyn (EXFOR
    F0012.002)``; ``ferraro2018`` -> ``Ferraro (2018)``.  Bare numbers are
    dropped: in these models they encode an angle or a final state, which the
    segment itself already reports.  Anything else is kept, so two files never
    collapse to the same name.
    """
    tokens = [t for t in re.split(r"[-_]", stem) if t]
    if not tokens:
        return stem
    head, rest = tokens[0], tokens[1:]
    year = None
    match = re.match(r"^([A-Za-z]+?)((?:19|20)\d{2})$", head)
    if match:
        head, year = match.group(1), match.group(2)
    name = _WORDS.get(head.lower()) or (head[:1].upper() + head[1:]
                                         if head.islower() else head)
    extras = []
    if year:
        extras.append(year)
    for token in rest:
        if _EXFOR.match(token):
            extras.append(f"EXFOR {_EXFOR.match(token).group(1)}."
                          f"{_EXFOR.match(token).group(2)}")
        elif token.isdigit() or token.lower() in _REACTION_TAGS:
            continue
        else:
            extras.append(_WORDS.get(token.lower(), token))
    return f"{name} ({', '.join(extras)})" if extras else name


def _find_azr(directory: str) -> Optional[str]:
    for name in sorted(os.listdir(directory)):
        if name.endswith(".azr"):
            return os.path.join(directory, name)
    return None


def _read_info(directory: str) -> Dict:
    """Read the optional ``info.json``; absent or malformed is not fatal.

    A broken metadata file should not hide an otherwise working evaluation, so
    this degrades to "no citation" rather than raising.
    """
    path = os.path.join(directory, "info.json")
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            info = json.load(f)
    except (json.JSONDecodeError, OSError) as err:
        log.error("%s: ignored, it is not valid JSON (%s); "
                  "python -m app.check says how to fix it", path, err)
        return {}
    return info if isinstance(info, dict) else {}


def load(directory: str) -> Optional[Evaluation]:
    """Describe one evaluation directory, or ``None`` if it holds no model."""
    azr_path = _find_azr(directory)
    if azr_path is None:
        return None

    try:
        labels = labels_from_file(azr_path)
    except (ValueError, OSError):
        # An unreadable <levels> block means the model cannot be served at all.
        return None

    info = _read_info(directory)
    try:
        from pyazr.datasets import SegmentSet
        segments = SegmentSet.from_file(azr_path)
    except (ValueError, OSError):
        segments = []
    entrance = entrance_key(segments, labels)
    derived_title = (compound_nucleus(labels, entrance)
                     or os.path.basename(directory))
    derived_reactions = reactions(segments, labels)
    labels = _apply_label_overrides(labels, info.get("channels"))
    listed = info.get("reactions")

    return Evaluation(
        id=os.path.basename(directory.rstrip(os.sep)),
        path=os.path.abspath(directory),
        azr_path=os.path.abspath(azr_path),
        title=info.get("title") or derived_title,
        channels=[c.label for c in labels],
        author=_text(info.get("analysis")) or _text(info.get("author")),
        reference=info.get("reference"),
        labels=labels,
        entrance_key=entrance,
        reactions=(listed if isinstance(listed, list) and listed
                   else derived_reactions),
        info=info,
    )


def _apply_label_overrides(labels: List[ChannelLabel],
                           channels) -> List[ChannelLabel]:
    """Overlay an ``info.json`` ``channels`` list onto the derived labels.

    The list is positional -- entry ``i`` names the pair with key ``i + 1`` in
    the .azr file -- so it is applied per pair rather than wholesale.  Overriding is opt-in per position:
    a shorter list leaves the remaining pairs derived, and entries beyond the
    model's pair count are ignored, since an evaluation's metadata can outlive
    the channel it described.
    """
    if not channels:
        return labels
    by_number = {c.number: c for c in labels}
    for position, override in enumerate(channels, start=1):
        label = by_number.get(position)
        if label is not None and isinstance(override, str) and override.strip():
            label.label = override
    return labels


def discover(root: str) -> List[Evaluation]:
    """Every evaluation under ``root``, sorted by id."""
    if not os.path.isdir(root):
        raise FileNotFoundError(f"evaluations directory not found: {root}")
    found = []
    for name in sorted(os.listdir(root)):
        directory = os.path.join(root, name)
        if not os.path.isdir(directory):
            continue
        evaluation = load(directory)
        if evaluation is not None:
            found.append(evaluation)
    return found


def get(root: str, evaluation_id: str) -> Evaluation:
    """One evaluation by id.

    The id is resolved against the discovered set rather than joined onto a
    path, so a crafted id cannot escape the evaluations directory.
    """
    for evaluation in discover(root):
        if evaluation.id == evaluation_id:
            return evaluation
    raise FileNotFoundError(f"no such evaluation: {evaluation_id}")

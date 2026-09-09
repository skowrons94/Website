"""Discovery of the evaluations served by this instance.

An evaluation is just a directory containing one ``.azr`` file, alongside the
``data/``, ``output/`` and ``checks/`` directories AZURE2 itself uses.  Adding
one means dropping the folder in -- there is no registry to update.

Everything shown about an evaluation is derived from the model itself (see
:mod:`app.labels`) except the two things a file cannot know: who produced it and
what to cite.  Those live in an optional ``info.json``::

    {"author": "J. Skowronski", "reference": "10.1103/PhysRevC.111.035802"}

``title`` and ``channels`` may also be set there to override the derived values,
but need not be -- an evaluation with no ``info.json`` still works, it just has
no citation to show.
"""

import json
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from app.labels import ChannelLabel, compound_nucleus, labels_from_file


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

    @property
    def azr_filename(self) -> str:
        return os.path.basename(self.azr_path)

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "title": self.title,
            "channels": self.channels,
            "author": self.author,
            "reference": self.reference,
            "filename": self.azr_filename,
            "entrance": self.labels[0].reaction if self.labels else None,
        }


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
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


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
    derived_title = compound_nucleus(labels) or os.path.basename(directory)
    labels = _apply_label_overrides(labels, info.get("channels"))

    return Evaluation(
        id=os.path.basename(directory.rstrip(os.sep)),
        path=os.path.abspath(directory),
        azr_path=os.path.abspath(azr_path),
        title=info.get("title") or derived_title,
        channels=[c.label for c in labels],
        author=info.get("author"),
        reference=info.get("reference"),
        labels=labels,
    )


def _apply_label_overrides(labels: List[ChannelLabel],
                           channels) -> List[ChannelLabel]:
    """Overlay an ``info.json`` ``channels`` list onto the derived labels.

    The list is positional -- entry ``i`` names pair ``i + 1`` -- so it is
    applied per pair rather than wholesale.  Overriding is opt-in per position:
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

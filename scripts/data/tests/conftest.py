import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))           # scripts/data, for `import nucdata`

FIXTURES = os.path.join(HERE, "fixtures")
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
PUBLIC_DATA = os.environ.get("DX_OUT", os.path.join(REPO, "public", "data"))


def fixture(*parts):
    return os.path.join(FIXTURES, *parts)


def read(*parts):
    with open(fixture(*parts), encoding="latin-1") as f:
        return f.read()

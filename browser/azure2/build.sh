#!/usr/bin/env bash
# Compile AZURE2's Python engine module (pyazr._azure2) to WebAssembly for
# Pyodide.  Needs emsdk activated at the version the Pyodide release was built
# with (Pyodide 0.28.x: Emscripten 4.0.9), python3 with pybind11, git, cmake.
#
#   browser/azure2/build.sh <work-dir>
#
# Leaves <work-dir>/_azure2.cpython-313-wasm32-emscripten.so and the AZURE2
# checkout in <work-dir>/AZURE2 (its pyazr/ is shipped next to the module).
#
# The AZURE2 commit is the one deploy/Dockerfile.azure2 pins, so the site and
# the server always run the same physics.  CMake is not used: the engine's
# CMakeLists requires OpenMP and readline, neither of which exists here, and the
# sources it compiles are listed below instead (as in src/CMakeLists.txt).
set -euo pipefail

WORK=$(mkdir -p "$1" && cd "$1" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
REF=$(sed -n 's/^ARG AZURE2_REF=//p' "$REPO/deploy/Dockerfile.azure2")
# ampl/gsl (GSL with a CMake build) by commit, not by its mutable tag: this is
# what the tag v2.7.0 pointed at when it was pinned (git ls-remote, 2026-10-13).
GSL_COMMIT=55c260c1eb103e960998a290d84558ae7d8062c4
PYODIDE=${PYODIDE:-0.28.3}
# SHA-256 of xbuildenv-0.28.3.tar.bz2 from the Pyodide release, recorded
# 2026-10-13 (the same download gave pyodide-core-0.28.3's recorded hash in
# pages.yml). Another Pyodide version needs its own hash here.
XBUILDENV_SHA256=7c1229a3d634e07a440fc916d56738ac4db61410dc6f50eb59a11e4a30f1b56a
JOBS=${JOBS:-$(nproc)}

cd "$WORK"
[ -d AZURE2 ] || git clone --quiet https://github.com/rdeboer1/AZURE2.git
git -C AZURE2 checkout --quiet --force --detach "$REF"
# The patches every build of the pinned commit gets, as the server's
# (deploy/azure2-patches/README.md).  checkout --force first, so a work
# directory never carries them over to another commit.
PATCHES=()
for p in "$REPO"/deploy/azure2-patches/*.patch; do [ -f "$p" ] && PATCHES+=("$p"); done
for p in "${PATCHES[@]}"; do git -C AZURE2 apply "$p"; done
if [ ! -d gsl ]; then
  git init --quiet gsl
  git -C gsl fetch --quiet --depth 1 https://github.com/ampl/gsl.git "$GSL_COMMIT"
  git -C gsl checkout --quiet --detach FETCH_HEAD
fi
test "$(git -C gsl rev-parse HEAD)" = "$GSL_COMMIT"

# Python headers of the Pyodide build, from its cross-build environment.
# Downloaded to a file and checked before tar sees a byte of it.
if [ ! -d xbuildenv ]; then
  [ "$PYODIDE" = 0.28.3 ] || { echo "no recorded SHA-256 for xbuildenv-$PYODIDE" >&2; exit 1; }
  curl -sSfL -o "xbuildenv-$PYODIDE.tar.bz2" \
    "https://github.com/pyodide/pyodide/releases/download/$PYODIDE/xbuildenv-$PYODIDE.tar.bz2"
  echo "$XBUILDENV_SHA256  xbuildenv-$PYODIDE.tar.bz2" | sha256sum -c - > /dev/null
  tar -xjf "xbuildenv-$PYODIDE.tar.bz2"
  rm "xbuildenv-$PYODIDE.tar.bz2"
fi
PYINC=$(ls -d "$WORK"/xbuildenv/pyodide-root/cpython/installs/python-*/include/python3.*)

CFLAGS="-O2 -DNDEBUG -fPIC -fwasm-exceptions -sSUPPORT_LONGJMP"

if [ ! -f gsl-prefix/lib/libgsl.a ]; then
  CFLAGS="$CFLAGS" emcmake cmake -S gsl -B gsl-build -DCMAKE_BUILD_TYPE=Release \
    -DGSL_DISABLE_TESTS=ON -DNO_AMPL_BINDINGS=ON -DBUILD_SHARED_LIBS=OFF \
    -DCMAKE_POSITION_INDEPENDENT_CODE=ON -DCMAKE_INSTALL_PREFIX="$WORK/gsl-prefix" > /dev/null
  cmake --build gsl-build -j "$JOBS" > /dev/null
  cmake --install gsl-build > /dev/null
fi

A=$WORK/AZURE2
FLAGS="$CFLAGS -std=c++17 -w -DUSE_ERYA -DUSE_MCMC -DNO_READLINE -DNO_STAT
  -DMATH_NO_PLUGIN_MANAGER -DROOT_Math_VecTypes -DMATHCORE_STANDALONE
  -I$HERE -I$WORK/gsl-prefix/include -I$A/include -I$A/api/include
  -I$A/external/coul/include -I$A/external/minuit2/inc -I$A/external/erya/include
  -I$A/external/erya/pugixml/src -I$A/numcmc/include
  $(python3 -m pybind11 --includes | tr ' ' '\n' | grep pybind11) -I$PYINC"

core=$(sed -n '/set(AZURE2_CORE_SOURCES/,/)/p' "$A/src/CMakeLists.txt" \
  | sed 's/set(AZURE2_CORE_SOURCES//; s/)//' | tr -s ' \n' '\n' | grep '\.cpp$')
minuit=$(sed -n '/set(MINUIT2_SOURCES/,/)/p' "$A/external/minuit2/src/CMakeLists.txt" \
  | tr -s ' \n' '\n' | grep '\.cxx$')
{
  for f in $core gui_stub.cpp AZURECalcMCMC.cpp; do echo "$A/src/$f"; done
  for f in $minuit; do echo "$A/external/minuit2/src/$f"; done
  ls "$A"/external/minuit2/src/math/*.cxx "$A"/external/coul/src/*.cpp "$A"/numcmc/src/*.cpp \
     "$A"/external/erya/src/*.cpp "$A"/external/erya/pugixml/src/pugixml.cpp
  echo "$A/api/src/AZUREAPI.cpp"
  echo "$A/api/src/pybind_api.cpp"
} > sources.txt

# The objects are cached by source path, not content: built from another
# AZURE2 commit or other patches (in the same work directory) they would be
# linked in as they are, so they go when either changes.
STAMP="$REF $(cat "${PATCHES[@]}" /dev/null | sha256sum | cut -c1-16)"
if [ "$(cat obj/.ref 2>/dev/null)" != "$STAMP" ]; then rm -rf obj; fi
mkdir -p obj
echo "$STAMP" > obj/.ref
export FLAGS
xargs -P "$JOBS" -I{} sh -c 'o=obj/$(echo "{}" | md5sum | cut -c1-10)_$(basename "{}").o; [ -f "$o" ] || em++ $FLAGS -c "{}" -o "$o"' < sources.txt

em++ -O2 -sSIDE_MODULE=1 -sWASM_BIGINT -fwasm-exceptions -sSUPPORT_LONGJMP obj/*.o \
  gsl-prefix/lib/libgsl.a gsl-prefix/lib/libgslcblas.a \
  -o _azure2.cpython-313-wasm32-emscripten.so
ls -l _azure2.cpython-313-wasm32-emscripten.so

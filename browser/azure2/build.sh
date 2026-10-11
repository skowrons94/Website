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
GSL_REF=${GSL_REF:-v2.7.0}          # ampl/gsl: GSL with a CMake build
PYODIDE=${PYODIDE:-0.28.3}
JOBS=${JOBS:-$(nproc)}

cd "$WORK"
[ -d AZURE2 ] || git clone --quiet https://github.com/rdeboer1/AZURE2.git
git -C AZURE2 checkout --quiet --detach "$REF"
[ -d gsl ] || git clone --quiet --depth 1 --branch "$GSL_REF" https://github.com/ampl/gsl.git

# Python headers of the Pyodide build, from its cross-build environment.
if [ ! -d xbuildenv ]; then
  curl -sSL "https://github.com/pyodide/pyodide/releases/download/$PYODIDE/xbuildenv-$PYODIDE.tar.bz2" | tar -xj
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

mkdir -p obj
export FLAGS
xargs -P "$JOBS" -I{} sh -c 'o=obj/$(echo "{}" | md5sum | cut -c1-10)_$(basename "{}").o; [ -f "$o" ] || em++ $FLAGS -c "{}" -o "$o"' < sources.txt

em++ -O2 -sSIDE_MODULE=1 -sWASM_BIGINT -fwasm-exceptions -sSUPPORT_LONGJMP obj/*.o \
  gsl-prefix/lib/libgsl.a gsl-prefix/lib/libgslcblas.a \
  -o _azure2.cpython-313-wasm32-emscripten.so
ls -l _azure2.cpython-313-wasm32-emscripten.so

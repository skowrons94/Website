# Patches to the pinned AZURE2

Every build of the AZURE2 commit pinned in `deploy/Dockerfile.azure2` applies
these, in name order: the server image, the Pages workflow's native build (for
the precomputed results) and the WebAssembly build (`browser/azure2/build.sh`).
None of them changes what AZURE2 calculates. `git apply` stops a build when one
no longer fits, so a new pin has them reviewed: drop the ones upstream has
taken.

- `ec-signature-component-keys.patch`: the signature AZURE2 checks stored
  external-capture integrals against (`EData::ECSignature`, `intEC.*.sig`)
  included the keys of the component segments of a total capture. Those come
  from a process-wide counter, so the same model built twice in one process,
  or after another model with a total capture, got another signature and its
  integrals were recalculated. The patch identifies a component by its place
  in the walk instead. The committed `.sig` files are written by a patched
  build.
- `env-without-openmp.patch`: `src/AZURECalc.cpp` defines `setEnvVar` and
  `unsetEnvVar` inside `#ifdef _OPENMP` and calls them outside it, so a build
  without OpenMP (the WebAssembly one) does not compile. The patch moves the
  `#endif`.

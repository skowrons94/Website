---
title: Identical particles, and half the partial waves that vanish
summary: >-
  When the projectile and the target are the same nucleus, quantum mechanics
  forbids asking which one went where. The consequences — a Mott cross section
  symmetric about 90°, and the disappearance of every odd partial wave — with
  carbon-12 on carbon-12 as the example.
date: 2026-06-28
topic: R-matrix theory
references:
  - "N. F. Mott, *The collision between two electrons*, Proc. R. Soc. Lond. A **126**, 259 (1930)."
  - "A. M. Lane and R. G. Thomas, *R-matrix theory of nuclear reactions*, Rev. Mod. Phys. **30**, 257 (1958)."
  - "M. Notani et al., *Fusion of ¹²C+¹²C at low energies*, Phys. Rev. C **85**, 014607 (2012)."
---

## The distinguishable baseline

For two distinguishable charged spinless particles, the centre-of-mass elastic
scattering amplitude splits into a Coulomb and a nuclear part,

$$
f(\theta) \;=\; f_{C}(\theta) \;+\; f_{N}(\theta),
$$

with the Rutherford amplitude

$$
f_{C}(\theta) \;=\; -\frac{\eta}{2k\sin^{2}(\theta/2)}\,
\exp\!\bigl[-i\eta\ln\sin^{2}(\theta/2) + 2i\sigma_{0}\bigr],
\qquad
\eta = \frac{Z_{1}Z_{2}e^{2}\mu}{\hbar^{2}k},
$$

and the nuclear amplitude expanded in partial waves,

$$
f_{N}(\theta) \;=\; \frac{1}{2ik}\sum_{L} (2L+1)\,e^{2i\sigma_{L}}\,
(S_{L} - 1)\,P_{L}(\cos\theta).
$$

The differential cross section is the modulus squared of the sum,

$$
\frac{d\sigma}{d\Omega} = |f_{C}+f_{N}|^{2}
   = |f_{C}|^{2} + |f_{N}|^{2} + 2\,\mathrm{Re}\!\left[f_{C}^{*}f_{N}\right],
$$

three terms one can name: pure Coulomb, pure nuclear, and the Coulomb–nuclear
interference that carries most of the sensitivity to the nuclear phase.

## What changes when the two particles are the same

A detector at angle $\theta$ registers a particle. If the beam and target nuclei
are identical, there is no measurement that can decide whether it is the
projectile, scattered through $\theta$, or the target, recoiling at
$180^\circ - \theta$. The two histories lead to the same final state, so quantum
mechanics does not let one add their probabilities — it requires adding their
*amplitudes*, with a sign set by the statistics of the particles.

In the centre-of-mass frame, exchanging the two particles is exactly the
substitution $\theta \to \pi - \theta$. The physical amplitude is therefore

$$
F(\theta) \;=\; f(\theta) \;+\; \varepsilon\, f(\pi-\theta),
\qquad
\varepsilon = (-1)^{2j} = \begin{cases} +1 & \text{identical bosons} \\
                                       -1 & \text{identical fermions} \end{cases}
$$

applied to the combined spatial-and-intrinsic-spin state. For two $0^+$ bosons
there is no spin part and the rule is simply $\varepsilon = +1$.

### Half the partial waves disappear

Substituting into the partial-wave expansion and using
$P_{L}(-\cos\theta) = (-1)^{L}P_{L}(\cos\theta)$,

$$
f_{N}(\theta) + \varepsilon\, f_{N}(\pi-\theta)
\;=\; \frac{1}{2ik}\sum_{L} (2L+1)\bigl[1 + \varepsilon(-1)^{L}\bigr]\,
e^{2i\sigma_{L}}(S_{L}-1)\,P_{L}(\cos\theta).
$$

The bracket $\bigl[1+\varepsilon(-1)^{L}\bigr]$ is **2 for allowed $L$ and 0 for
forbidden $L$**. For two $0^+$ bosons only **even $L$** survives; for two identical
fermions coupled to $S=0$ only odd $L$ does.

This is a strong statement, and it is worth being clear about what it means for a
level scheme. In $^{12}\mathrm{C} + {}^{12}\mathrm{C}$ elastic scattering, a
$J^\pi = 1^-$ or $3^-$ resonance in $^{24}\mathrm{Mg}$ simply cannot be populated
through that channel — not because its coupling is small, but because the
symmetrised amplitude for odd $L$ is identically zero. Only natural-parity,
even-$J$ states appear. A model that carries odd-$L$ channels in this pair is not
slightly wrong; it is summing over pathways that do not exist.

### The Mott cross section

Doing the same to the Coulomb amplitude gives the **Mott amplitude**
$F_C = f_C(\theta) + \varepsilon f_C(\pi - \theta)$. Squaring it for identical
$0^+$ bosons ($\varepsilon = +1$) yields

$$
\frac{d\sigma_{\text{Mott}}}{d\Omega} \;=\;
\left(\frac{\eta}{2k}\right)^{2}\!\left[
  \frac{1}{\sin^{4}(\theta/2)}
+ \frac{1}{\cos^{4}(\theta/2)}
+ \frac{2\cos\!\bigl(\eta\ln\tan^{2}(\theta/2)\bigr)}
       {\sin^{2}(\theta/2)\cos^{2}(\theta/2)}
\right].
$$

Each term has a reading. The first is ordinary Rutherford scattering at $\theta$.
The second is Rutherford scattering at $\pi - \theta$ — the recoil, mirrored into
the same detector. The third is the **Coulomb–exchange interference**, and it is
the characteristic signature of identical particles: an oscillation in $\theta$
whose frequency is set by $\eta$, and which has no counterpart in the
distinguishable case.

At $\theta = 90^\circ$ the three terms are $1$, $1$ and $2\cos(0) \cdot 1 = 2$
times a common factor, so the Mott cross section is exactly **twice** the
Rutherford prediction at the same angle. The exchange term has doubled it. The
whole angular distribution is, necessarily, symmetric about $90^\circ$: there is no
way to distinguish forward from backward when the two particles are the same.

### Putting the two together

Combining the symmetrised Coulomb and nuclear amplitudes,

$$
\frac{d\sigma}{d\Omega} \;=\; |F_{C}+F_{N}|^{2}
\;=\; |F_{C}|^{2} + |F_{N}|^{2} + 2\,\mathrm{Re}\!\left[F_{C}^{*}F_{N}\right].
$$

For $0^+$ bosons, once the forbidden odd-$L$ channels are removed the surviving
even-$L$ terms each acquire the factor 2 from the bracket, so
$F_{N}(\theta) = 2 f_{N}(\theta)$, and the three terms scale in three different
ways:

| term | distinguishable | identical $0^+$ bosons |
|---|---|---|
| Coulomb | $\lvert f_{C}\rvert^{2}$ | $\lvert F_{C}\rvert^{2}$ *(Mott)* |
| nuclear | $\lvert f_{N}\rvert^{2}$ | $4\,\lvert f_{N}\rvert^{2}$ |
| interference | $2\,\mathrm{Re}[f_{C}^{*}f_{N}]$ | $4\,\mathrm{Re}[F_{C}^{*}f_{N}]$, i.e. twice the distinguishable value |

The asymmetry between the factors — 4 on the nuclear term, 2 on the interference —
is not a bookkeeping accident. The nuclear term is second order in an amplitude
that was doubled; the interference is first order in it, against a Coulomb
amplitude that was replaced rather than scaled.

## The example: carbon-12 on carbon-12

$^{12}\mathrm{C}$ has $J^\pi = 0^+$ in its ground state, $Z = 6$, and is its own
partner in the reaction that governs carbon burning in massive stars. It is the
cleanest realisation of the case above: two identical spinless bosons, so
$\varepsilon = +1$, only even $L$, and a Mott Coulomb cross section.

Three consequences follow for an evaluation of this system.

**The angular range is halved.** Because the distribution must be symmetric about
$90^\circ$, data at $\theta$ and at $180^\circ - \theta$ are the same measurement.
Reporting both is double counting, and fitting both weights those angles twice.

**The Coulomb baseline is not Rutherford.** Normalising elastic data to a
Rutherford calculation — the standard way of removing the trivial energy and angle
dependence — is wrong here by the exchange terms, which near $90^\circ$ amount to a
factor of two and, away from it, to an oscillation. What the oscillation is
sensitive to is $\eta$, and therefore the beam energy: the Mott interference is
itself a rather good energy calibration.

**The resonances that can appear are restricted.** $^{24}\mathrm{Mg}$ has a dense
spectrum near the $^{12}\mathrm{C}+^{12}\mathrm{C}$ threshold, and the molecular
resonances that dominate the fusion excitation function are seen in this channel
only if they are even-$J$ and natural parity. Combined with the $0^+ \otimes 0^+$
coupling, which forces $J = L$, the elastic channel is a spin-parity filter of
unusual sharpness: an observed elastic resonance has its $J^\pi$ almost fixed by
the fact that it was observed at all.

## Beyond spinless bosons

The scaling factors above are specific to $0^+ \otimes 0^+$. The general structure
is not. For particles carrying spin, the exchange operation acts on the spin state
as well as on the angle, and the symmetrisation must be done channel-spin by
channel-spin: a symmetric spin state pairs with even $L$ and an antisymmetric one
with odd $L$ (or the reverse, for fermions). Two protons, for instance, have a
singlet that admits only even $L$ and a triplet that admits only odd $L$, and both
contribute to the same cross section, so the neat "half the partial waves vanish"
statement becomes "each spin state uses half the partial waves, and which half
depends on the spin state". The Mott Coulomb term survives unchanged, since the
Coulomb interaction does not touch spin.

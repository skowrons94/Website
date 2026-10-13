---
title: When a reduced width stops being measurable
summary: >-
  An R-matrix fit can describe the data well and still contain a parameter the
  data cannot see. Why that happens, why the channel radius controls
  it, and how to tell before trusting an uncertainty.
date: 2026-07-20
topic: R-matrix theory
featured: true
references:
  - "A. M. Lane and R. G. Thomas, *R-matrix theory of nuclear reactions*, Rev. Mod. Phys. **30**, 257 (1958)."
  - "F. C. Barker, *Consistent descriptions of nuclear levels*, Aust. J. Phys. **25**, 341 (1972)."
  - "C. R. Brune, *Alternative parametrization of R-matrix theory*, Phys. Rev. C **66**, 044611 (2002)."
  - "P. Descouvemont and D. Baye, *The R-matrix theory*, Rep. Prog. Phys. **73**, 036301 (2010)."
---

Take a single-level R-matrix description of a reaction, fit it to data, and obtain
an excellent $\chi^2$. Now try to put uncertainties on the resonance parameters by
sampling the posterior. The sampler does not converge: the walkers drift away
without bound, the transformation between parameter sets starts throwing warnings,
and the marginal distributions come out in shapes no Gaussian would recognize.

Neither the sampler nor the data is at fault. One of the parameters has stopped
being a physical quantity and become a redundant coordinate. Why that happens, how
to diagnose it and how to cure it all come down to the channel radius, and that is
what this note is about.

## What R-matrix theory does

R-matrix theory is, before anything else, a division of space. Draw a sphere
of radius $a$ — the *channel radius* — around the pair of fragments and treats the
two sides by completely different means:

| region | what is there | how it is described |
|---|---|---|
| $r < a$ | all nucleons interacting, many-body | a few poles $(E_\lambda, \gamma_{\lambda c})$ |
| $r > a$ | Coulomb and centrifugal forces only | known functions $(F_\ell, G_\ell)$ |

The essential point, and the one most often lost, is that **this surface is a
choice of bookkeeping, not a physical boundary**. Nothing happens at $r = a$. A
larger $a$ does not mean the fragments are more tightly bound, or more likely to
fuse; it means we have drawn a larger box and declared more of the wave function
to be “interior”. If the model were complete, every observable would be
independent of where the surface is put. What *does* depend on $a$ is how the
description divides its labour between the two sides.

The reduced-width amplitude $\gamma_{\lambda c}$ is essentially the amplitude of
the level's wave function *at the surface*. It is therefore not an observable:
move the surface and it changes. What can be measured is the **observed partial
width** $\Gamma_c$, the decay rate into channel $c$.

## From reduced width to observed width

The textbook relation between the two is $\Gamma_c = 2\gamma_c^2 P_c$, with $P_c$
the penetrability — the probability of getting out through the Coulomb and
centrifugal barriers. That formula is incomplete. The correct one carries a
normalization,

$$
\Gamma_c \;=\; \frac{2\,\gamma_c^{2}\,P_c(E_\lambda)}{N},
\qquad
N \;=\; 1 + \sum_{c'} \gamma_{c'}^{2}\,\frac{\mathrm{d}S_{c'}}{\mathrm{d}E}\bigg|_{E_\lambda},
$$

where $S_c$ is the shift function of channel $c$. Everything in this note follows
from reading $N$ correctly, so it is worth doing slowly.

$N$ is a **normalization**. A physical state must be normalized over all space,
but the pole describes only the inside. Splitting the normalization integral at
$r = a$,

$$
\underbrace{1}_{\int_0^a |u|^2\,\mathrm{d}r}
\;+\;
\underbrace{\sum_c \gamma_c^{2}\,\frac{\mathrm{d}S_c}{\mathrm{d}E}}_{\sum_c \int_a^\infty |u_c|^2\,\mathrm{d}r}
\;=\; N .
$$

The 1 is the piece of the state inside the channel radius; each
$\gamma_c^2\,\mathrm{d}S_c/\mathrm{d}E$ is the piece that has leaked out into
channel $c$. Hence the single most useful number in this note,

$$
\boxed{\;f_{\mathrm{ext}} \;\equiv\; 1 - \frac{1}{N}
\;=\; \text{fraction of the level lying outside the channel radius.}\;}
$$

$N = 1$ means the state is entirely inside the box and $\Gamma = 2\gamma^2 P$ is
adequate. $N = 2$ means half in, half out. $N = 34$ means 97% of the state is
outside the box we have drawn.

> This identification is exact for a channel that is closed at $E_\lambda$, where
> $\mathrm{d}S/\mathrm{d}E$ is literally the normalization integral of the
> exterior Whittaker tail. Above threshold it is the analytic continuation of the
> same object, and the “fraction outside” reading is the standard physical gloss
> rather than a theorem. None of the algebra below depends on the
> interpretation — only the intuition does.

## The worked example

The $^3\mathrm{H}(d,n)^4\mathrm{He}$ cross section at astrophysical energies is
carried by a single level: the $J^\pi = 3/2^+$ state of $^5\mathrm{He}$, 80 keV
above the $d+t$ threshold, with an $\ell = 0$ deuteron channel
($a_d = 3.5\ \mathrm{fm}$) and an $\ell = 2$ neutron channel
($a_n = 4.0\ \mathrm{fm}$). It is a large, loosely bound $d+t$ cluster state: a
state that barely exists as a bound object has a wave function that extends far.

| channel | $\ell$ | $a$ [fm] | $P_c$ | $\mathrm{d}S_c/\mathrm{d}E$ [MeV⁻¹] | $D_c \equiv (\mathrm{d}S_c/\mathrm{d}E)/P_c$ |
|---|---|---|---|---|---|
| $d+t$ | 0 | 3.5 | $5.1485 \times 10^{-2}$ | 1.1778 | 22.88 |
| $n+\alpha$ | 2 | 4.0 | 2.4434 | $1.8579 \times 10^{-2}$ | 0.0076 |

The deuteron channel is barely open and sits under a Coulomb barrier, so its
penetrability is small. The neutron channel is 17.7 MeV above its threshold and is
wide open.

A fit to 121 data points gives $\gamma_d = 5.3032\ \mathrm{MeV}^{1/2}$,
$\gamma_n = 0.78059\ \mathrm{MeV}^{1/2}$ and $\chi^2 \approx 100$. Then

$$
N = 34.1, \qquad f_{\mathrm{ext}} = 97.1\ \%, \qquad
\theta_d^{2} \equiv \frac{\gamma_d^{2}\,\mu a^{2}}{\hbar^{2}} = 9.95 .
$$

The dimensionless reduced width is ten times the single-particle limit, and 97%
of the level is outside the box. Both are symptoms of the same thing.

## Why the width saturates

Now ask the question a fitter asks: what happens to the observable as the
coupling is turned up? Let $\gamma$ grow. The numerator of $\Gamma_c$ grows like $\gamma^2$
— but so does $N$, because pushing more amplitude through the surface puts more of
the state outside. A ratio of two quantities both growing like $\gamma^2$ tends to
a constant:

$$
\Gamma_c \;\xrightarrow[\;\gamma \to \infty\;]{}\; \frac{2P_c}{\mathrm{d}S_c/\mathrm{d}E} .
$$

The reduced width has disappeared from the answer. Physically: **a level cannot
decay faster than its channel kinematics allow.** Once the state is essentially
all outside, increasing the internal coupling adds nothing — there is no more
“inside” left to couple to.

The crossover sits at $\gamma_{\mathrm{knee}} = (\mathrm{d}S/\mathrm{d}E)^{-1/2}$,
which for the deuteron channel of the example is $0.92\ \mathrm{MeV}^{1/2}$. Below
the knee, $\Gamma \propto \gamma^2$ as expected; above it, $\Gamma$ is flat and
$\gamma$ is **unidentifiable** — not merely poorly determined, but absent from the
observables. The fitted $\gamma_d = 5.30$ sits 5.8 times past the knee, at 97% of
its ceiling.

For a $\chi^2$ minimization this is a curiosity: the minimizer finds *some* point
on the plateau and reports it. For an uncertainty analysis it is fatal, because
the likelihood possesses an exactly flat direction of infinite extent. The
signature is visible in the fit itself: the error matrix of the example returns
$\gamma_d = 5.90 \pm 12.41$ (a 210% error) and $\gamma_n = 0.867 \pm 1.780$,
errors whose *ratio*, 6.97, reproduces the ratio of the values themselves, 6.81.
Almost all the uncertainty lies along the direction that scales both couplings
together, and almost none across it: the data fix the branching ratio and let the
overall scale float.

## The same statement as a budget with a hard ceiling

The saturation argument was about $\gamma$. It is more useful read backwards, in
terms of the widths themselves. Multiply the width relation by
$D_c \equiv (\mathrm{d}S_c/\mathrm{d}E)/P_c$ and sum over channels:

$$
\sum_c \Gamma_c D_c
\;=\; \frac{2}{N}\sum_c \gamma_c^{2}\,\frac{\mathrm{d}S_c}{\mathrm{d}E}
\;=\; 2\,\frac{N-1}{N} \;=\; 2 f_{\mathrm{ext}} .
$$

Since we cannot have more than all of a state outside a sphere,
$f_{\mathrm{ext}} \le 1$, and therefore

$$
\boxed{\;\sum_c \Gamma_c D_c \;\le\; 2, \qquad D_c = \frac{\mathrm{d}S_c/\mathrm{d}E}{P_c}\;}
$$

This is a **hard ceiling on the observed widths themselves**, and it is the most
practically useful form of everything above. Read $D_c$ as the “cost per unit
width” of channel $c$, and 2 as the total budget. A set of widths violating the
ceiling does not correspond to any reduced width whatsoever: it is not improbable,
it is *unrepresentable*.

Two features of the budget are worth noting. First, the cost is dominated by the
barely-open channel: in the example the $d+t$ channel spends 97% of the budget
and the wide-open $n+\alpha$ channel spends 0.03%, because a large $P$ makes $D$
small. Sub-threshold and near-threshold charged channels are where this pathology
lives. Second, the budget consumed falls steadily as the channel radius grows:

| $a$ [fm] | 3.5 | 4.0 | 4.5 | 5.0 | 6.0 | 7.0 |
|---|---|---|---|---|---|---|
| $\sum_c \Gamma_c D_c$ at the measured widths | 1.94 (97%) | 1.80 (90%) | 1.68 (84%) | 1.58 (79%) | 1.38 (69%) | 1.22 (61%) |

### What the ceiling does to the inverse transformation

Analyses that fit *observed* widths rather than reduced ones must invert the width
relation. Solving the budget identity for the normalization and substituting gives

$$
\gamma_c^{2} \;=\; \frac{\Gamma_c}{P_c\,\mathcal{D}},
\qquad
\mathcal{D} \;=\; 2 - \sum_{c'} \Gamma_{c'} D_{c'} \;=\; \frac{2}{N} \;=\; 2\,(1-f_{\mathrm{ext}}).
$$

The denominator $\mathcal{D}$ is exactly the *unspent* budget. Two consequences
follow immediately, and they are the operational heart of the matter.

**The inverse map has a pole at the ceiling.** As $\sum_c \Gamma_c D_c \to 2$,
$\mathcal{D} \to 0$ and the reduced width required to produce the requested
observed width diverges. A model sitting at 97% of its budget is sitting next to
a singularity.

**Past the ceiling, $\mathcal{D}$ turns negative.** A negative $\mathcal{D}$ means
the requested widths would need more than 100% of the level outside the surface.
Implementations that take the absolute value at this point do not fail — they
return a valid-looking but *different* model, and the map folds back on itself:
requesting a larger width returns a smaller one. At $a_d = 3.5$ fm in the example
the ceiling is 87.4 keV; asking for 120 keV returns a 69 keV model. This is the
mechanism behind transformation warnings that nevertheless leave a fit running.

## What the channel radius does

Everything so far was at fixed $a$. Now move the surface, and watch the two
quantities that make up the cost $D_c$ compete:

- **$P_c$ rises.** The penetrability is the probability of tunnelling out starting
  from $r = a$; start further out and less barrier remains. For the $d+t$ channel
  of the example, $P_d$ goes from $5.15 \times 10^{-2}$ at 3.5 fm to
  $1.54 \times 10^{-1}$ at 7 fm, a factor 3.0.
- **$\mathrm{d}S_c/\mathrm{d}E$ also rises**, but more slowly: 1.18 to 2.22, a
  factor 1.9.

$P$ wins, so $D_c$ falls (from 22.9 to 14.4), the ceiling $2/D_c$ rises, and
$f_{\mathrm{ext}}$ falls. **That competition is the entire mechanism.** The
physical reading is simply that a bigger box holds more of the state, so less of
it is “outside”, so the reduced width recovers its meaning. Nothing about the
nuclear force has changed; we have stopped describing a large object with a small
box.

The table below is the same data fitted at a ladder of channel radii, both
channels moved together, each row an independent converged refit.

| $a$ [fm] | $\chi^2$ | $\gamma_d$ [MeV$^{1/2}$] | $\sigma(\gamma_d)/\gamma_d$ | $\theta_d^2$ | $f_{\mathrm{ext}}$ | headroom in $\Gamma_d$ |
|---|---|---|---|---|---|---|
| 3.00 | 97.9 | 42.58 | 45% | 471 | 99.95% | 0.1% |
| 3.25 | 97.8 | 11.58 | 42% | 40.9 | 99.33% | 0.7% |
| 3.50 | 97.7 | 6.654 | 40% | 15.7 | 98.11% | 1.9% |
| 4.00 | 97.6 | 2.241 | 25% | 2.32 | 87.23% | 14.7% |
| 4.50 | 97.3 | 1.379 | 14% | 1.11 | 74.82% | 33.7% |
| 5.00 | 96.8 | 1.072 | 12% | 0.83 | 66.78% | 49.8% |
| 5.50 | 96.4 | 0.903 | 10% | 0.71 | 60.99% | 64.0% |
| 6.00 | 96.4 | 0.794 | 9% | 0.66 | 56.58% | 76.8% |
| 7.00 | 97.9 | 0.667 | 8% | 0.63 | 50.68% | 97.3% |

Three columns deserve attention.

**$\chi^2$ is flat.** It varies between 96.4 and 97.9 across a factor of more than
two in radius. The data are indifferent to where the surface is placed, just as
the theory says they should be. *Goodness of fit cannot be used to
choose $a$.*

**The reduced width becomes identified.** Its fractional error falls monotonically
from 45% to 8%, and $\theta_d^2$ falls from 471 to below unity. The same data,
the same physics, a different coordinate — and a parameter that was invisible
becomes measurable.

**The headroom opens up.** From 0.1% at 3 fm to 97% at 7 fm. This column
predicts, quantitatively, how badly a width-space fit or sampler will misbehave:
at 3.5 fm a proposal only 2% away is already unrepresentable, while at 6 fm it
takes a 77% excursion.

None of this makes $a$ a free parameter to be pushed as far as convenient. Too
small, and a truly extended cluster state is mostly external — the pathology
of this note. Too large, and the assumption that only Coulomb and centrifugal
forces act beyond $a$ fails, while the interior grows too big to be described by a
few poles. There is a window, and the diagnostics above tell one which end of it a
given model is sitting at.

## Consequences for uncertainty quantification

The two parameterisations fail in two different ways, and it is worth seeing both
because the symptoms look nothing alike.

**Sampling reduced widths.** The likelihood is exactly flat along the direction
that scales all $\gamma_c$ together at fixed ratio. With an unbounded prior the
posterior is improper: walkers drift in $\log\gamma$ without limit while the
calculated cross section stays put, because the observables stopped depending on
the scale beyond the knee. The chain looks broken; it is in fact faithfully
reporting that the model contains a redundant coordinate.

**Sampling observed widths.** The same degeneracy is compressed into a *finite*
interval that ends at the ceiling, and it is the singular map, not the flat
direction, that does the damage. At 3.5 fm the profile likelihood is flat to
$\Delta\chi^2 < 0.01$ across the whole saturated range, its minimum sits on the
ceiling itself, and the $\Delta\chi^2 = 1$ interval runs from about 58 keV to
89 keV — a flat-topped slab with a hard wall on one side. That is not a shape any
sampler can render as a Gaussian. Past the wall the folded branch re-enters the
model space backwards and contributes a second, spurious lobe. At 6 fm the profile
near the mode is an ordinary parabola and the width is measured.

One caution. Enlarging the radius removes the *failures* and restores a Gaussian
core, but it does not by itself remove the unbounded direction: the folded branch
survives, merely displaced far from the mode, and there it returns to
$\Delta\chi^2 \approx 1$. The reason is transparent in the algebra — on the folded
branch $\gamma_c^2 = \Gamma_c/(P_c|\mathcal{D}|)$ and, as $\Gamma_d \to \infty$,
$\mathcal{D} \to -\Gamma_d D_d$, so $\gamma_d \to (\mathrm{d}S_d/\mathrm{d}E)^{-1/2}$,
which is precisely the knee. When the knee happens to lie near the best-fit value,
as it does at 6 fm, the far branch is a reasonable model. **A bounded prior
is required regardless of the radius.**

## An alternative: an attractive potential outside the surface

There is a second way to attack the same problem. Instead of moving the surface
outward, one admits that the nuclear force does not stop abruptly at $r = a$: a
Woods–Saxon (or Gaussian) well is added to the Coulomb and centrifugal potential
in the external region, and the external wave functions are obtained by numerical
integration inward from a large matching radius — where the pure Coulomb solution
is imposed — instead of analytically. $P_c$ and $\mathrm{d}S_c/\mathrm{d}E$ are
then evaluated from those solutions.

The attraction pulls amplitude inward, so both quantities increase sharply. For
the example, with a well of depth 150 MeV, $R = 3.6$ fm, $a_{\mathrm{ws}} = 0.6$
fm, at the original $a_d = 3.5$ fm:

| | pure Coulomb | with the potential | ratio |
|---|---|---|---|
| $P_d$ | $5.148 \times 10^{-2}$ | $4.323 \times 10^{-1}$ | × 8.40 |
| $\mathrm{d}S_d/\mathrm{d}E$ | 1.1778 | 8.4328 | × 7.16 |
| $D_d$ | 22.88 | 19.51 | × 0.85 |

Both move by nearly an order of magnitude, but they move *together*, so the
ceiling — which depends only on their ratio — shifts by just 15%. The real gain
appears on refitting: because $P_d$ is eight times larger, a far smaller
$\gamma_d$ reproduces the same cross section, and the model leaves the saturated
regime altogether:

| configuration | $\chi^2$ | $\gamma_d$ | $\theta_d^2$ | $f_{\mathrm{ext}}$ | headroom |
|---|---|---|---|---|---|
| $a = (3.5, 4.0)$, pure Coulomb | 97.7 | 5.303 | 9.95 | 97.07% | 3.0% |
| $a = (3.5, 4.0)$, with the potential | 96.5 | 0.478 | 0.08 | 66.79% | 49.7% |
| $a = 5.0$ fm, pure Coulomb | 96.8 | 1.072 | 0.83 | 66.78% | 49.8% |
| $a = 6.0$ fm, pure Coulomb | 96.4 | 0.794 | 0.66 | 56.58% | 76.8% |

The second and third rows are numerically indistinguishable: $N = 3.011$ against
3.010, $f_{\mathrm{ext}} = 66.79$% against 66.78%. **Adding an attractive tail at
3.5 fm does the same job as moving the surface to 5 fm**, and for the same reason —
both get the description to where the state is.

Two cautions. First, the effect is *not monotonic* in the well depth. The external
potential has single-particle states of its own, and when one of them falls near
the level energy, $P$ and $\mathrm{d}S/\mathrm{d}E$ diverge and
$\mathrm{d}S/\mathrm{d}E$ can change sign. In the example, a depth of 75 MeV drives
$\mathrm{d}S/\mathrm{d}E$ to $-110$ and $N$ below unity, while 100 MeV gives
$N = 54.6$ — worse than using no potential at all. A negative
$\mathrm{d}S/\mathrm{d}E$ means the channel adds normalization budget instead of
spending it, and the interpretation of the split integral breaks down. Second, one
has traded a single arbitrary choice, $a$, for four: $a$ and the three potential
parameters, none of which the data meaningfully constrain. The diagnostics must be
checked afterwards either way.

## Practical summary

1. **Compute $f_{\mathrm{ext}} = 1 - 1/N$ before doing anything statistical.** It
   costs nothing — $N$ is already formed inside the width transformation — and it
   is the single number that predicts whether a fit is well conditioned. Above
   roughly 90%, the reduced width of that level is not a measurement. Below
   roughly 70%, the model is in good shape.
2. **Check $\theta_c^2$ as well.** A dimensionless reduced width far above unity is
   the same warning in different units.
3. **Do not use $\chi^2$ to choose the channel radius.** It is flat against $a$ by
   construction. Use $f_{\mathrm{ext}}$ and $\theta^2$.
4. **Widths above the budget are not merely unlikely — they do not exist.** If a
   negative denominator is reported and the calculation continues, treat every
   subsequent number from that evaluation as unreliable, and check whether the
   proposal was rejected or silently replaced.
5. **Bound the prior.** Even a well-conditioned radius leaves the folded branch
   somewhere. Either $\theta_c^2 \le 1$ or, most directly,
   $\sum_c \Gamma_c D_c < 2$, which is the exact statement of “physically
   representable”.

The broader lesson generalizes beyond R-matrix theory. A model parameter is only a
measurement if the observables depend on it. Here the dependence is switched off
smoothly, by a normalization that grows in step with the coupling, and the switch
is thrown by a quantity the analyst chooses rather than measures. Any level whose
normalization $N$ departs appreciably from unity should be treated as a candidate
for this behaviour before, not after, an uncertainty analysis is attempted.

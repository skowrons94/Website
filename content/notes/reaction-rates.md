---
title: From a cross section to a stellar reaction rate
summary: >-
  The integral that turns a laboratory cross section into the quantity a stellar
  model consumes, why it samples an energy window no experiment can reach, and a
  regime in which the standard perturbative treatment of radiative capture fails
  without any obvious warning.
date: 2026-05-30
topic: Nuclear astrophysics
featured: true
references:
  - "C. Iliadis, *Nuclear Physics of Stars*, 2nd ed., Wiley-VCH (2015), ch. 3."
  - "C. Rolfs and W. Rodney, *Cauldrons in the Cosmos*, University of Chicago Press (1988)."
  - "C. W. Reich and M. S. Moore, *Multilevel formula for the fission process*, Phys. Rev. **111**, 929 (1958)."
---

A cross section is what an experiment measures. A stellar model cannot use one: in
a star the reacting particles have a distribution of energies, set by the
temperature, and what the model needs is the number of reactions per second per
unit density. Getting from one to the other is a single integral, and almost
everything interesting about nuclear astrophysics is hidden inside it.

## The integral

In a non-degenerate, non-relativistic plasma at temperature $T$ the relative
velocities of two species follow a Maxwell–Boltzmann distribution. The reaction
rate per particle pair is the cross section averaged over that distribution,

$$
\langle \sigma v \rangle
= \left(\frac{8}{\pi\mu}\right)^{1/2}\!\left(kT\right)^{-3/2}
\int_0^\infty \sigma(E)\,E\,\exp\!\left(-\frac{E}{kT}\right)\mathrm{d}E ,
$$

with $\mu$ the reduced mass. Two things about this expression organise everything
that follows.

First, **$\sigma(E)$ does not depend on temperature**. Only the weight does. The
nuclear physics enters once, as a function of energy; the temperature only decides
which part of it is sampled. That is a structural fact, not a computational
convenience, and it is the reason a rate can be tabulated for hundreds of
temperatures from a single cross-section curve.

Second, the integrand is a **product of two opposing exponentials**. For charged
particles, $\sigma(E)$ is suppressed at low energy by Coulomb barrier penetration,
which is roughly $\exp(-2\pi\eta)$ with $\eta \propto Z_1 Z_2/\sqrt{E}$; the
Maxwell–Boltzmann factor is suppressed at high energy by $\exp(-E/kT)$. One rises,
the other falls, and their product is sharply peaked.

## The Gamow window

That peak is the **Gamow window**. For a non-resonant reaction, writing
$\sigma(E) = S(E)\,E^{-1}\exp(-2\pi\eta)$ to pull the trivial barrier dependence
out into the astrophysical S-factor, the integrand becomes
$S(E)\exp\!\left[-E/kT - b/\sqrt{E}\right]$, and the exponent has a maximum at

$$
E_0 = \left(\frac{b\,kT}{2}\right)^{2/3},
\qquad
b = \frac{\pi\,Z_1 Z_2 e^2 \sqrt{2\mu}}{\hbar} .
$$

The width of the peak is $\Delta \approx 4\sqrt{E_0 kT/3}$.

The numbers are the point. For $^{12}\mathrm{C}(p,\gamma)^{13}\mathrm{N}$ in the
CNO cycle of the Sun, $T \approx 15$ MK, and $E_0 \approx 24$ keV with
$\Delta \approx 13$ keV. The Coulomb barrier for that pair is around 2 MeV. The
reaction proceeds almost entirely by tunnelling, in an energy window nearly two
orders of magnitude below the barrier, where the cross section is of order
picobarns or less.

This is why the field looks the way it does. Measuring at $E_0$ directly is either
impossible or requires burying the experiment to escape cosmic-ray background —
which is what LUNA does. Where a direct measurement cannot reach, one measures as
low as possible and then *extrapolates* into the window with a model. R-matrix
theory is that model, and the extrapolation, not the measurement, usually carries
the dominant uncertainty in the final rate.

## Two limits worth knowing by heart

**Narrow resonance.** If a resonance is much narrower than the width of the Gamow
window and than $kT$, the Maxwell–Boltzmann factor is effectively constant across
it and can be taken outside the integral. The integral over the Breit–Wigner shape
is then analytic, and the rate contribution collapses onto a single number, the
**resonance strength**

$$
\omega\gamma = \frac{2J+1}{(2J_1+1)(2J_2+1)}\,\frac{\Gamma_a \Gamma_b}{\Gamma},
$$

giving

$$
N_A\langle\sigma v\rangle \;\propto\; (kT)^{-3/2}\,\omega\gamma\,
\exp\!\left(-\frac{E_r}{kT}\right) .
$$

Everything about the resonance except its energy and its strength has dropped out.
This is why experiments quote $\omega\gamma$: it is the only property of a narrow
resonance that a stellar rate can see.

**Broad or interfering resonances.** As soon as levels overlap, or a resonance is
comparable in width to $kT$, the factorisation fails: interference terms between
levels can be as large as the levels themselves, and the sign of the interference
changes across the resonance. The integral must then be done numerically over the
full R-matrix cross section, and the answer is not the sum of the individual
strengths.

A useful consistency check follows from the first limit. A numerical integration
that resolves a narrow resonance properly *must* converge to the analytic
$\omega\gamma$ result. If it does not, either the quadrature is not resolving the
peak, or the cross section is not what one thinks it is — and the second of those
is the subject of the rest of this note.

## When the resonance in the cross section has the wrong width

Here is a subtlety that only shows up for radiative capture, and only in a
particular regime, but that changes an integrated rate by orders of magnitude when
it does.

In the standard treatment of capture, the γ-channel is handled **perturbatively**:
the radiative width enters the capture *amplitude*, but it does not enter the
denominator of the level matrix. The particle channels do. The consequence is
immediate once stated:

- the resonance in $\sigma(E)$ has width $\Gamma_p$, the **particle** width alone,
  not the total width;
- its peak height scales as $\Gamma_\gamma/\Gamma_p$;
- and therefore the integrated area $\int \sigma\,\mathrm{d}E$ is too large by a
  factor $\Gamma_{\text{total}}/\Gamma_p$.

The area is what the rate integral collects. So the error is not a shape detail;
it is a multiplicative factor on the resonance's entire contribution.

When does it matter?

| regime | behaviour |
|---|---|
| $\Gamma_\gamma \ll \Gamma_p$ (the usual case) | $\Gamma_{\text{total}} \approx \Gamma_p$, factor $\approx 1$ — essentially exact |
| $\Gamma_\gamma \approx \Gamma_p$ | deviation of order 2 |
| $\Gamma_\gamma \gg \Gamma_p$ | resonance far too narrow and too tall; area too large by $\Gamma_\gamma/\Gamma_p$ |

The last row is not exotic. It is the generic situation for **low-energy
charged-particle capture on a heavy target**, where the proton width is
Coulomb-suppressed to values far below a typical radiative width. For proton
capture on $^{45}\mathrm{V}$, for instance, near-threshold resonances have
$\Gamma_p \sim 10^{-13}$–$10^{-10}$ MeV while $\Gamma_\gamma \sim 10^{-7}$ MeV.
The over-count factor for a single resonance there is $\Gamma_{\text{total}}/\Gamma_p
\approx 18.5$, and the effect on the total rate at high temperature, where narrow
resonances dominate, reaches two orders of magnitude.

### How to recognise it without knowing the answer

Two diagnostics settle it immediately.

**The peak violates unitarity.** A cross section cannot exceed the unitarity limit
$\pi\bar{\lambda}^2 (2J+1)/[(2J_1+1)(2J_2+1)]$ for a single resonance. In the
$^{45}\mathrm{V}$ case the calculated peak sits about $10^7$ times above it — a
value of $5.9 \times 10^6$ barn, which is not a number any cross section can take.
When the peak is impossible, the perturbative treatment has broken down; the
formalism is being used outside its domain.

**The Lorentzian wings measure the width.** Far from the peak a Breit–Wigner falls
as $\delta^{-2}$ with a coefficient set by the width. Fitting the wings and
comparing the result to $\Gamma_p$ and to $\Gamma_{\text{total}}$ tells one
directly which width is shaping the resonance.

Away from resonances — direct capture, the smooth wings — the cross section is
correct in either treatment. It is only the resonance areas that are affected.

### The cure

The correct tool for this regime is the **Reich–Moore** treatment, which moves the
radiative width into the level matrix denominator, $E_\lambda \to E_\lambda -
i\Gamma_\gamma/2$. The resonance then has its true width $\Gamma_{\text{total}}$,
its peak respects unitarity, and the integrated area reproduces the analytic
narrow-resonance result $\int\sigma\,\mathrm{d}E = 2\pi^2\bar{\lambda}^2\,\omega\gamma$
as it must.

This is not free. Reich–Moore eliminates the γ-channels as explicit channels, which
sits awkwardly with the external-capture amplitude discussed in
[Where radiative capture happens](/notes/external-capture) — the external
amplitude is built in the same channel that Reich–Moore has absorbed. For neutron
capture, where external capture is negligible, the combination is
straightforward. For low-energy charged-particle capture, which is where
$\Gamma_\gamma \gg \Gamma_p$ arises, combining a Reich–Moore-broadened internal
amplitude coherently with an external one is a genuine open problem in the
formalism rather than a matter of implementation.

## Computing it in practice

The structure of the problem dictates the algorithm, and it is worth spelling out
because the naive approach is unusable.

Since $\sigma(E)$ is temperature-independent and the R-matrix evaluation of a
single energy point is expensive — a complex matrix inversion, plus external-capture
radial integrals — the cross section should be computed **once**, on a fixed energy
grid, and every temperature integrated against that. Letting an adaptive quadrature
choose fresh nodes for each of a few hundred temperatures repeats the expensive
physics a few hundred times over, for no gain.

The grid needs care in one respect: it must resolve the resonances. A logarithmic
backbone across the energy range gives smooth cheap coverage and keeps the Gamow
window resolved at every temperature; on top of it, each resonance needs a cluster
of points, geometrically spaced from a core of order $\Gamma/16$ out to wings of
order $64\Gamma$. And the width that sets the cluster spacing is the width that
shapes $\sigma(E)$ — which, by the argument above, is $\Gamma_p$ in the
perturbative treatment and $\Gamma_{\text{total}}$ under Reich–Moore. Sizing the
cluster with the wrong one is how a resonance gets stepped over entirely, producing
a rate that is too *low* by an equally arbitrary factor.

Interpolation between grid points should preserve positivity and avoid overshoot at
interference dips and resonance peaks; a monotone Steffen spline does both, where
a natural cubic spline will ring. Once the spline exists, each temperature is a
one-dimensional quadrature with breakpoints at the resonances, costing
microseconds.

One numerical trap deserves mention. Evaluating exactly *on* a pole is delicate:
in the Brune parameterisation the boundary condition is $B_c = S_c(E_\lambda)$, so
at $E = E_\lambda$ the real part of the level-matrix diagonal,
$(E_\lambda - E) - \gamma^2[S(E) - S(E_\lambda)]$, vanishes identically, leaving
only a small imaginary part. If the penetrability is also small the matrix can be
truly singular. The physical values immediately either side are finite and
well behaved, so the practical answer is to detect the failure and drop that single
point rather than to place a grid point exactly on the resonance energy.

---
title: Where radiative capture happens
summary: >-
  Not every capture γ-ray is emitted by a compound nucleus. Two amplitudes —
  one from inside the channel radius, one from outside it — add coherently, and
  keeping them straight requires knowing exactly how a reaction is decomposed into
  pathways. With ¹²C(α,γ)¹⁶O as the example.
date: 2026-06-15
topic: R-matrix theory
references:
  - "F. C. Barker and T. Kajino, *The ¹²C(α,γ)¹⁶O cross section at low energies*, Aust. J. Phys. **44**, 369 (1991)."
  - "C. Angulo and P. Descouvemont, *The ¹⁴N(p,γ)¹⁵O low-energy S-factor*, Nucl. Phys. A **690**, 755 (2001)."
  - "R. J. deBoer et al., *The ¹²C(α,γ)¹⁶O reaction and its implications for stellar helium burning*, Rev. Mod. Phys. **89**, 035007 (2017)."
---

R-matrix theory begins by drawing a sphere of radius $a$ around a pair of
fragments and describing the two sides differently: inside, a few poles stand in
for the whole many-body problem; outside, only Coulomb and centrifugal forces act
and the wave functions are known analytically.

For elastic scattering that division is invisible in the answer. For radiative
capture it is not, because a photon can be emitted from either side of the surface.
The electromagnetic operator has support everywhere, so the capture amplitude
splits into an *internal* piece — the resonant one, carried by the poles — and an
*external* piece, in which the photon is emitted while the two fragments are still
approaching, in the region where they are not yet a compound nucleus at all. The
two add coherently, and at low energy the external piece is very often the larger.

Getting this right requires knowing precisely which pathways the reaction has, so
it is worth building the decomposition first.

## How a reaction decomposes

Everything is organized around the compound nucleus, and around the fact that
total angular momentum $J$ and parity are conserved.

**A pair** is a two-body partition of the system: $\alpha + {}^{12}\mathrm{C}$,
$p + {}^{15}\mathrm{N}$, or — for capture — a photon plus the residual nucleus in
one of its bound states, $\gamma + {}^{16}\mathrm{O}(\text{g.s.})$. The pair fixes
the masses, charges, spins and the separation energy, and therefore the
penetrabilities and the kinematics.

**A decay** is a specific final pair the compound nucleus can break up into. One
entrance pair generally has several decays: elastic back to itself, inelastic to an
excited state, capture to each bound state of the residual nucleus.

**Channel spins.** Within a decay, the entrance pair's intrinsic spins couple to a
channel spin $s$, and the exit pair's to $s'$. Grouping pathways by $(s, s')$ is
what makes the statistical spin weights come out right, and it is why the model
parameters — the reduced widths — are labelled by channel rather than by
individual spin projections. A capture transition to a $2^+$ final state, for
instance, has more than one allowed $s'$, and the pathways for each must be
collected separately before they are weighted and summed.

**Pathways.** Within a fixed $(s, s')$, one concrete route is a triple
$(J, \text{entrance channel}, \text{exit channel})$: a definite total angular
momentum, a definite entrance orbital angular momentum, and a definite exit one.
This is the level at which the collision matrix is computed — each such
route contributes one element, and the observable is a coherent sum over routes
followed by an incoherent sum over the things that were not measured.

The hierarchy matters here because the external capture amplitude has to be
enumerated over the same set of routes as the internal one. If a route is counted
twice, the two amplitudes are added twice, coherently, and the capture cross
section is inflated by an amount that depends on how much of the total that route
carried — the kind of error that a good $\chi^2$ will absorb into
the fitted widths rather than reveal.

## The two flavours of external capture

Once the pathway list exists, external capture comes in two physically distinct
forms.

### Direct, or hard-sphere, capture

The particle arrives in the entrance channel, does not form a compound state, and
radiates directly into a final bound state. The amplitude is a radial integral of
the electromagnetic multipole operator between the entrance-channel scattering
wave function and the bound-state wave function, taken over the **external region
only**, $r > a$, where both are known Coulomb and Whittaker functions.

Two features follow from that being an integral over the outside.

It is **non-resonant**: a smooth function of energy, with no poles, contributing a
slowly varying background to the S-factor. And it is controlled by the
**asymptotic normalization coefficient** of the final state, not by an interior
property: what the integral samples is the tail of the bound-state wave function,
so a loosely bound final state — a large ANC — gives a large direct-capture
amplitude. This is why the low-energy capture cross section on light nuclei can be
dominated by a quantity that no compound-nucleus picture contains.

### Channel capture

The second form is subtler, and it is the one that couples the two regions.

The particle arrives, scatters resonantly through an internal level — that is, it
forms the compound nucleus and comes back out into a particle channel — and *then*
radiates from the external region into the final bound state. The amplitude is the
same external radial integral as before, but multiplied by the collision-matrix
element of that intermediate particle channel.

So channel capture carries the resonant energy dependence of the intermediate
level while the photon is still emitted outside. It is neither purely internal nor
purely external, and it interferes with both. Building it requires walking the
intermediate particle decay's pathway list, which is where the decomposition of the
previous section stops being bookkeeping and starts being physics: each
intermediate route contributes its own collision-matrix element, and the set of
routes must be exactly the physical one.

### Which final states have which

Not every transition has a channel-capture contribution. It exists only if the
intermediate particle decay has pathways whose quantum numbers connect the entrance
channel to the final state through an allowed multipole. In practice this is a
strong filter: in a given evaluation some final states acquire channel capture and
others do not, and the two groups can behave quite differently as the model is
varied.

## The example: carbon-12(α,γ)oxygen-16

This reaction sets the carbon-to-oxygen ratio at the end of helium burning, and
with it the entire subsequent evolution of a massive star. It is also the standard
hard case for external capture, for a reason that is easy to state: the astrophysical
energy is around 300 keV, the nearest levels of $^{16}\mathrm{O}$ that carry the
strength are *sub-threshold*, and the ground-state transition is dominated by E1
and E2 amplitudes whose external parts are large.

The transitions to the low-lying states of $^{16}\mathrm{O}$ divide cleanly:

| final state | $J^\pi$ | channel-capture pathways? |
|---|---|---|
| ground state | $0^+$ | yes |
| 6.05 MeV | $0^+$ | no |
| 6.13 MeV | $3^-$ | yes |
| 6.92 MeV | $2^+$ | yes |
| 7.12 MeV | $1^-$ | no |

The ones with channel capture are sensitive to the intermediate resonant
scattering; the ones without are pure direct capture plus the internal resonant
amplitude. A model change that touches the intermediate pathway enumeration moves
the first group and leaves the second untouched — and switching external capture
off entirely makes all five agree again, because then no external amplitude is
built at all.

The size of the effect is not marginal. For the ground-state transition, doubling
the channel-capture contribution moves the cross section at
$E_{\mathrm{c.m.}} \approx 4.9$ MeV from $2.61 \times 10^{-7}$ to
$6.56 \times 10^{-7}$ barn — a factor 2.5 — and shifts the total-capture excitation
function by up to 108%. The dominant single term in that coherent sum has a
collision-matrix element of order $10^{-4}$ against an external normalization of
about 14; it is the product that matters, and it is comparable to everything else
combined.

The practical consequence is worth stating plainly. Because the internal and
external amplitudes interfere, an error in one is absorbed by the fit into the
reduced widths of the other. A fit performed with a mis-enumerated external
amplitude will still describe the data — the widths will simply have moved to
compensate — and the damage appears only on extrapolation, where the two
amplitudes have different energy dependences and no longer cancel in the same way.
This is the general hazard of coherent decompositions, and the reason a capture
evaluation should be checked by turning external capture off and on and confirming
that the transitions which *should* be insensitive to it really are.

## Why this structure exists at all

It is tempting to see external capture as a correction bolted onto a
compound-nucleus calculation. It is better understood as the price of the channel
radius.

The sphere at $r = a$ was introduced so the interior could be replaced by poles. A
photon emitted at $r < a$ is described by those poles; a photon emitted at $r > a$
is not, and would simply be missing. Adding the external amplitude restores it. The
division between “resonant” and “direct” capture is therefore not a physical
distinction between two mechanisms so much as a consequence of where the
bookkeeping surface was drawn — which is the same lesson as in
[When a reduced width stops being measurable](/notes/channel-radius): move the
surface and the split between the two amplitudes moves with it, while their sum,
if the model is complete, does not.

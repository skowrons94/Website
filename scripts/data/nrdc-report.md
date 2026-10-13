**Draft, not sent (owner's decision).**

# Draft: compilation errors in EXFOR, for the NRDC

Generated from `scripts/data/corrections.yaml` by `python scripts/data/dx.py nrdc-report`;
do not edit by hand. Every item was checked against the
EXFOR file of exfor_master commit `d2af85eca4ce9b76529f096e7f9603da60654732` (2026-09-28);
its status says whether it has also been confirmed from the paper.

To: the NRDC network, via the IAEA Nuclear Data Section (address to fill in)

Dear colleagues,

while building a public explorer of the EXFOR data for nuclear astrophysics, we found the
following 18 subentries whose energies or values are given in the wrong frame,
unit or scale. We correct them on our site and would be glad to see them corrected in EXFOR.

| Subentry | Reaction | Problem | Correction | Reported |
|---|---|---|---|---|
| F0580.002 | 12C(a,g)16O, partial S-factor to the ground state | EN (a laboratory heading) holds centre-of-mass energies. | EN is EN-CM | no |
| F0580.003 | 12C(a,g)16O, partial S-factor of the cascade through 6.92 MeV | EN (a laboratory heading) holds centre-of-mass energies, as in F0580.002. | EN is EN-CM | no |
| O2548.002 | 13C(a,n)16O, S-factor (bare and screening-corrected) | EN (a laboratory heading) holds centre-of-mass energies. | EN is EN-CM | no |
| O2313.002 | 17O(p,a)14N, strength of the 64.5 keV resonance | EN-RES (a laboratory heading) holds the centre-of-mass resonance energy. | EN-RES is EN-RES-CM | no |
| O2313.003 | 17O(p,g)18F, width of the 64.5 keV resonance | EN-RES (a laboratory heading) holds the centre-of-mass resonance energy, as in O2313.002. | EN-RES is EN-RES-CM | no |
| C2168.002 | 12C(12C,n)23Mg, modified S-factor | EN (a laboratory heading) holds centre-of-mass energies. | EN is EN-CM | no |
| C1825.002 | 15N(p,g)16O, partial cross section to the ground state | EN-CM is given in MeV under a KEV unit. | EN-CM unit is MEV | no |
| C1825.003 | 15N(p,g)16O, partial S-factor to the ground state | EN (a laboratory heading) holds centre-of-mass energies. | EN is EN-CM | no |
| C1825.008 | 15N(p,g)16O, partial cross section to the ground state (laboratory energies) | EN is given in MeV under a KEV unit. | EN unit is MEV | no |
| D0468.004 | 17O(p,a)/17O(p,g) strength ratio and 17O(p,g) strength of the 183 keV resonance | EN-RES and EN-RES-ERR are given in keV under an EV unit. | EN-RES unit is KEV; EN-RES-ERR unit is KEV | no |
| O2207.006 | 19F(p,a)16O, partial cross sections (a0, a1) | EN is given in MeV under a KEV unit. | EN unit is MEV | no |
| A1205.004 | 3He(a,g)7Be, partial S-factors (to the ground and first excited states) | DATA and ERR-T are 1000 times too large for their MB*MEV unit (they are eV b). | DATA x 0.001; ERR-T x 0.001 | no |
| A1205.005 | 3He(a,g)7Be, ratio of the partial S-factors | EN-CM is given in keV under a MEV unit. | EN-CM unit is KEV | no |
| O2597.002 | 12C(p,g)13N, S-factor | EN-CM is given in keV under a MEV unit. | EN-CM unit is KEV | no |
| O1420.008 | 12C(a,g0)16O, E1 S-factor | EN (a laboratory heading) holds centre-of-mass energies. | EN is EN-CM | no |
| C2375.002 | 13C(a,n)16O, S-factor (digitized from Fig. 2) | EN (a laboratory heading) holds centre-of-mass energies; the points appear to be Drotleff et al. (1993, A0613.003) re-digitized, not a measurement of Heil et al. | EN is EN-CM | no |
| C2254.003 | 22Ne(p,g)23Na, resonance strengths | EN-RES (a laboratory heading) holds centre-of-mass resonance energies. | EN-RES is EN-RES-CM | no |
| D0710.027 | 15N(p,a0)12C, Legendre coefficients | EN is given in MeV under a KEV unit. | EN unit is MEV | no |

## F0580.002: 12C(a,g)16O, partial S-factor to the ground state

Paper: A. Redder et al., Nucl. Phys. A 462, 385 (1987), Table 1.

Problem: EN (a laboratory heading) holds centre-of-mass energies.

Evidence:

- F0580.002 DATA: EN 0.94 ... 2.84 MEV; S peaks at EN = 2.33-2.36 MEV, the 1- level of 16O at E_x = 9.585 MeV, i.e. E_cm = 2.43 MeV, E_lab = 3.24 MeV: the column is c.m.
- F0580.001 COMMON: EN-NRM 2.36 MEV, the normalization point at the same 1- peak, in the same frame.

Status: owner to confirm from the paper.

## F0580.003: 12C(a,g)16O, partial S-factor of the cascade through 6.92 MeV

Paper: A. Redder et al., Nucl. Phys. A 462, 385 (1987), Table 3.

Problem: EN (a laboratory heading) holds centre-of-mass energies, as in F0580.002.

Evidence:

- F0580.003 DATA: EN 1.40 ... 2.84 MEV, the energies of F0580.002's table (same experiment, same runs).

Status: owner to confirm from the paper.

## O2548.002: 13C(a,n)16O, S-factor (bare and screening-corrected)

Paper: G. F. Ciani et al., Phys. Rev. Lett. 127, 152701 (2021), Table I.

Problem: EN (a laboratory heading) holds centre-of-mass energies.

Evidence:

- O2548.002 DATA: EN 233 ... 306 KEV.
- Read as E_lab, the rows would span E_cm = 178-234 keV; the expert review (r15) reads the PRL as E_cm = 230-300 keV, which is the column as given.
- O2548.001: EN-ERR 300 EV, the beam-energy uncertainty of the LUNA 400 kV machine, says nothing about the frame.
- LUNA's PANIC2021 proceedings (https://pos.sissa.it/380/318) give the range of the measurement as 230 < E_cm < 305 keV: the column as given.
- The LUNA neutron-array paper (arXiv:2411.05053) gives E_alpha,lab = 300-400 keV, i.e. E_cm = 229-306 keV: the column as given, not E_lab.

Status: confirmed by the owner (2026-10-13).

## O2313.002: 17O(p,a)14N, strength of the 64.5 keV resonance

Paper: C. G. Bruno et al., Phys. Rev. Lett. 117, 142502 (2016).

Problem: EN-RES (a laboratory heading) holds the centre-of-mass resonance energy.

Evidence:

- O2313.002 DATA: EN-RES 64.5 KEV; O2313.001 TITLE: 'the 64.5 keV resonance strength'.
- The resonance is the 5672.6 keV level of 18F (ENSDF); S_p(18F) = 5607.1 keV (AME2020), so E_cm = 65.5 keV and E_lab = 69.3 keV: 64.5 keV is a c.m. energy.

Status: owner to confirm from the paper.

## O2313.003: 17O(p,g)18F, width of the 64.5 keV resonance

Paper: C. G. Bruno et al., Phys. Rev. Lett. 117, 142502 (2016).

Problem: EN-RES (a laboratory heading) holds the centre-of-mass resonance energy, as in O2313.002.

Evidence:

- O2313.003 DATA: EN-RES 64.5 KEV, the same resonance as O2313.002.

Status: owner to confirm from the paper.

## C2168.002: 12C(12C,n)23Mg, modified S-factor

Paper: B. Bucher et al., Phys. Rev. Lett. 114, 251102 (2015), Fig. 1.

Problem: EN (a laboratory heading) holds centre-of-mass energies.

Evidence:

- C2168.002 DATA: EN 3.1 ... MEV.
- The reaction is endothermic, Q = -2.60 MeV (AME2020): read as E_lab, the lowest rows (3.1-5.1 MeV) are E_cm = 1.55-2.55 MeV, below threshold, where no neutron can be emitted. Read as E_cm they start 0.5 MeV above it, as the PRL's Fig. 1 shows.

Status: owner to confirm from the paper.

## C1825.002: 15N(p,g)16O, partial cross section to the ground state

Paper: P. J. LeBlanc et al., Phys. Rev. C 82, 055804 (2010).

Problem: EN-CM is given in MeV under a KEV unit.

Evidence:

- C1825.002 DATA: EN-CM, unit KEV, values 0.1232 ... 1.8: read as keV the lowest energy would be 123 eV, which no beam has reached.
- C1825.003 gives the same energies (0.1232 ...) under MEV, and C1825.008 the same rows in the laboratory as 0.1315 = 0.1232 x 16/15.

Status: owner to confirm from the paper.

## C1825.003: 15N(p,g)16O, partial S-factor to the ground state

Paper: P. J. LeBlanc et al., Phys. Rev. C 82, 055804 (2010).

Problem: EN (a laboratory heading) holds centre-of-mass energies.

Evidence:

- C1825.003 DATA: EN 0.1232 MEV, the same energies as C1825.002's EN-CM (c.m.) row by row.
- S = sigma E exp(2 pi eta) from C1825.002's lowest row (2.17E-09 b) gives 0.0567 MeV b with E_cm = 0.1232 MeV, against 0.0569 in C1825.003; taken as E_lab (E_cm = 0.1154 MeV) it would give 0.100 MeV b.

Status: owner to confirm from the paper.

## C1825.008: 15N(p,g)16O, partial cross section to the ground state (laboratory energies)

Paper: P. J. LeBlanc et al., Phys. Rev. C 82, 055804 (2010).

Problem: EN is given in MeV under a KEV unit.

Evidence:

- C1825.008 DATA: EN, unit KEV, lowest value 0.1315 = 0.1232 MeV (C1825.002, c.m.) x 16/15: laboratory MeV.

Status: owner to confirm from the paper.

## D0468.004: 17O(p,a)/17O(p,g) strength ratio and 17O(p,g) strength of the 183 keV resonance

Paper: A. Chafa et al., Phys. Rev. C 75, 035810 (2007).

Problem: EN-RES and EN-RES-ERR are given in keV under an EV unit.

Evidence:

- D0468.004 DATA: EN-RES 194.1, EN-RES-ERR 0.6, unit EV: read as eV the resonance would sit at 194 eV.
- D0468.005 COMMON gives the same resonance as EN-RES-CM 183.3 KEV, EN-RES-ERR 0.6 KEV; 183.3 x 18/17 = 194.1: laboratory keV.

Status: owner to confirm from the paper.

## O2207.006: 19F(p,a)16O, partial cross sections (a0, a1)

Paper: R. Caracciolo et al., Lett. Nuovo Cim. 11, 33 (1974), Fig. 3.

Problem: EN is given in MeV under a KEV unit.

Evidence:

- O2207.006 DATA: EN, unit KEV, values 0.789 ... 0.865: read as keV the lowest energy would be 0.75 keV (c.m.).
- O2207.002-.005 give the resonance energies of the same scan as EN-RES 0.835 ... 0.865 MEV; the title's 13.645 MeV state of 20Ne is E_cm = 0.80 MeV, E_lab = 0.84 MeV, where the cross section peaks.

Status: owner to confirm from the paper.

## A1205.004: 3He(a,g)7Be, partial S-factors (to the ground and first excited states)

Paper: H. Krawinkel et al., Z. Phys. A 304, 307 (1982), Table 4.

Problem: DATA and ERR-T are 1000 times too large for their MB*MEV unit (they are eV b).

Evidence:

- A1205.004 DATA at EN-CM 107.2 KEV: 254 (ground state) and 96 (429 keV state), unit MB*MEV.
- A1205.002, the total S-factor of the same table, gives 0.350 MB*MEV at 0.1072 MEV: 254 + 96 = 350, so the partials are in micro-b MeV (eV b), not mb MeV.

Status: owner to confirm from the paper.

## A1205.005: 3He(a,g)7Be, ratio of the partial S-factors

Paper: H. Krawinkel et al., Z. Phys. A 304, 307 (1982), Table 4.

Problem: EN-CM is given in keV under a MEV unit.

Evidence:

- A1205.005 DATA: EN-CM 107.2 ... unit MEV, the energies A1205.002 gives as 0.1072 ... MEV and A1205.004 as 107.2 ... KEV.

Status: owner to confirm from the paper.

## O2597.002: 12C(p,g)13N, S-factor

Paper: J. Skowronski et al., Phys. Rev. C 107, L062801 (2023).

Problem: EN-CM is given in keV under a MEV unit.

Evidence:

- O2597.002 DATA: EN-CM, unit MEV, values 620.6 ... 325.6 (and lower): read as MeV the 422 keV resonance would sit at 421 MeV.
- The S-factor peaks (222 b keV) at EN-CM 421.4: the 2369 keV level of 13N, E_cm = 2369 - 1943 = 421-426 keV (ENSDF, AME2020): keV.

Status: owner to confirm from the paper (his own; the erratum to the NRDC is his to send).

## O1420.008: 12C(a,g0)16O, E1 S-factor

Paper: M. Assuncao et al., Phys. Rev. C 73, 055801 (2006).

Problem: EN (a laboratory heading) holds centre-of-mass energies.

Evidence:

- O1420.008 COMMENT: 'En-cm is effective c.m. energy'; its siblings O1420.007, .009 and .010 give the same energies (1.31 ... 2.78 MEV) as EN-CM.
- The E1 S-factor peaks at EN = 2.27-2.34 MEV, the 1- level of 16O at E_cm = 2.42 MeV (E_lab 3.23 MeV).

Status: owner to confirm from the paper.

## C2375.002: 13C(a,n)16O, S-factor (digitized from Fig. 2)

Paper: M. Heil et al., Nucl. Phys. A 688, 499 (2001), Fig. 2.

Problem: EN (a laboratory heading) holds centre-of-mass energies; the points appear to be Drotleff et al. (1993, A0613.003) re-digitized, not a measurement of Heil et al.

Evidence:

- C2375.002 DATA: EN 0.277 MEV, S = 2.12E+06 MEV*B; A0613.003 (Drotleff 1993) gives EN-CM 0.279 MEV, sigma = 6.1E-11 B, i.e. S = 2.03E+06 MeV b; at 0.291/0.297 MeV: 1.52E+06 against 1.48E+06. The rows match Drotleff's c.m. energies, not E_lab (0.277 MeV E_lab would be E_cm = 0.213 MeV).
- C2375.002 STATUS: (CURVE) fig. 2; ANALYSIS: multilevel R-matrix fit of several channels.

Status: owner to confirm from the paper, and whether the set is a duplicate of A0613.003 (then it should not count at all).

## C2254.003: 22Ne(p,g)23Na, resonance strengths

Paper: K. J. Kelly et al., Phys. Rev. C 95, 015806 (2017).

Problem: EN-RES (a laboratory heading) holds centre-of-mass resonance energies.

Evidence:

- C2254.003 DATA: EN-RES 417 KEV with 8.8E-2 EV: the 436 keV (E_lab) resonance, whose strength 0.088 eV is the usual reference; 436 x 22/23 = 417, the c.m. energy. 151 and 178 likewise are the 156 and 186-190 keV (E_lab) resonances in c.m.
- C2254.001 FACILITY: 'Measurements at Elab < 200 keV' for the low resonances, and COMMON EN-NRM 458 KEV, the 479 keV (E_lab) resonance in c.m.

Status: owner to confirm from the paper.

## D0710.027: 15N(p,a0)12C, Legendre coefficients

Paper: K. H. Bray et al., Nucl. Phys. A 288, 334 (1977), Fig. 5.

Problem: EN is given in MeV under a KEV unit.

Evidence:

- D0710.027 DATA: EN, unit KEV, values 0.938 ... 1.264; D0710.015 gives the angular distribution at EN 0.938 MEV, D0710.016 at 0.988 MEV, and so on; TITLE: 'Levels of 16O near 13 MeV excitation from 15N+p' (S_p(16O) = 12.13 MeV: E_p about 1 MeV).
- D0710.012, the a1 coefficients of the same paper, gives EN 898 ... KEV: in keV, as its unit says.

Status: owner to confirm from the paper.

## Not reported (read differently on the site, not compilation errors)

- O0967.002 (22Ne(a,n)25Mg, cross section): Below the 830 keV resonance, the rows that are not DATA-MAX are given as plain values (DATA, 8-70% errors), including the bump at E_lab = 617-650 keV (the entry's title: 'New Ne-22(A,N)Mg-25 resonances at very low energies'); the same group's later measurement ascribes a resonance near 620 keV to background and gives only upper limits at these energies. On the site: DATA is DATA-MAX where EN < 819. confirmed by the owner (2026-10-13), from the literature on 22Ne(a,n).
- O1082.002 (22Ne(a,n)25Mg, partial cross section to the 25Mg ground state (relative)): Below the 830 keV resonance, the rows at E_lab = 792.3 and 818.5 keV are given as plain values (DATA, 40% and 30% errors), where the later direct measurements give only upper limits. On the site: DATA is DATA-MAX where EN < 0.819. confirmed by the owner (2026-10-13), from the literature on 22Ne(a,n).
- O1082.003 (22Ne(a,n)25Mg, cross section (relative)): Below the 830 keV resonance, the rows at E_lab = 618.7-813 keV are given as plain values (DATA, 40-550% errors), including the bump near 620 keV, where the later direct measurements give only upper limits. On the site: DATA is DATA-MAX where EN < 819. confirmed by the owner (2026-10-13), from the literature on 22Ne(a,n).

## Not reported (not verifiable from the EXFOR file)

- O1381.003 (2H(d,p)3H, S-factor with a deuterated Al target): Possibly: EN (a laboratory heading) may hold centre-of-mass energies (expert review r15, finding 10). Not applied: the file does not say. not applied; owner to decide from the paper (Fig. 1 of PLB 547, 193).

With best regards,

Jakub Skowronski

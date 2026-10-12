/**
 * Features of the rates explorer that are built and tested but not yet shown.
 *
 * LUNA_RATES_PUBLIC: the "Use the LUNA/AZURE2 rates" switch (¹²C(p,γ) and
 * ¹³C(p,γ) from the 13N/14N evaluations, scripts/rates/evaluated_rates.py),
 * its ¹²C/¹³C readout and the `&luna=1` link parameter. Off until Jakub
 * says whether the site's evaluations or his PRL 131, 162701 tables should
 * drive it: the evaluations give ¹²C/¹³C = 4.2 in CN equilibrium at 35 MK,
 * the PRL 3.6 ± 0.4. The tables stay in the network files and in
 * test:rates; the LUNA marks on the reaction chips are shown either way.
 */
export const LUNA_RATES_PUBLIC = false

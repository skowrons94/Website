/**
 * Features of the rates explorer that are built and tested but not yet shown.
 *
 * LUNA_RATES_PUBLIC: the "Use the LUNA/AZURE2 rates" switch (¹²C(p,γ) and
 * ¹³C(p,γ) from the 13N/14N evaluations, scripts/rates/evaluated_rates.py),
 * its ¹²C/¹³C readout and the `&luna=1` link parameter. Off until Jakub
 * says whether the site's evaluations or his PRL 131, 162701 tables should
 * drive it: the evaluations give ¹²C/¹³C = 4.2 in CN equilibrium at 35 MK,
 * the PRL 3.6 ± 0.4. The LUNA marks on the reaction chips are shown either way.
 *
 * Off means absent from the site, not only unseen. To switch it on:
 *  1. set it to true here and in the literal before rates-explorer.tsx's
 *     `Luna` (the bundler drops the panel's chunk only behind a literal);
 *  2. run `python scripts/rates/rate_alternatives.py`, which puts the
 *     evaluated rates (`alternatives`) back in public/rates/*.json
 *     (build.py does the same when it rebuilds them).
 * `npm run test:rates` fails until the three agree; it tests the tables
 * from scripts/rates/evaluated/ either way.
 */
export const LUNA_RATES_PUBLIC = false

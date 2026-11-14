---
name: scientific-validation
description: Verify scientific methods, datasets, and agricultural calculations in TERRA. Use when writing or changing code in lib/science/ or data/crops.ts, adding a crop parameter or formula (ET0, ETc, Kc, water balance, GDD, NDVI), integrating a dataset (NASA SMAP, MODIS, IMERG, POWER, ECOSTRESS, CMIP6), or making any scientific claim in the UI or docs.
---

# Scientific validation

## Checklist for a formula or calculation
1. **Source.** Name the method and the reference it comes from (e.g. FAO-56, Allen et al. 1998).
   Cite only a source you have actually opened or the user supplied. If you can't confirm it,
   mark the value `UNVERIFIED` in a code comment and in your reply.
2. **Units.** Write units on every input and output (mm/day, °C, m³/m³, fraction). Check each
   equation for dimensional consistency.
3. **Ranges.** Confirm values are physically plausible (soil moisture 0–field capacity, Kc ~0.1–1.3,
   NDVI −1 to 1, no negative storage). Add clamps only where physics requires them; never to hide bugs.
4. **Hand check.** Work one case by hand (or with a separate script) and compare with the code's output.
   Include the inputs and both results in your reply.
5. **Edge cases.** Zero rain, drought, saturation, first time step, leap years, missing data.
6. **Assumptions.** Every simplification goes in `ASSUMPTIONS` (see `lib/science/waterBalance.ts`)
   or a comment, with why it is acceptable here.

## Checklist for a dataset
- Product ID and version, provider, spatial and temporal resolution, units, fill/no-data values.
- What it actually measures vs what we use it for (e.g. SMAP = top ~5 cm, not root zone).
- Scale mismatch with a field plot, cloud/quality flags, latency.
- Keep the entry in `data/sources.ts` and its `caveat` accurate.

## Claims
- Separate **measured**, **estimated**, **modelled**, and **simulated** values — the UI tags must match.
- Parameters from general tables (FAO-56) are "indicative" until calibrated against local field data.
- A claim backed only by demo data is not a finding.

## Output
State: what was checked, how, the result, and what is still unverified.
Record lasting results in `docs/ai-ml/FINDINGS.md` (`findings-maintainer` skill).

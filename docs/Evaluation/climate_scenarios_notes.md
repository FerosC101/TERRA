# Climate Scenario Notes

Companion to `climate_scenarios.csv`. These notes record how the scenarios were built, what the values represent, and what they must not be used for.

## Data source and access

- **Dataset:** NASA POWER daily point API, POWER v2.10.3, MERRA-2 reanalysis.
- **Parameters:** `T2M` (mean 2 m air temperature), `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR` (precipitation, bias-corrected).
- **Period requested:** 1991-01-01 to 2020-12-31 (30 years, 10,958 days per point).
- **Community:** AG (agroclimatology).
- **Retrieval date:** 2026-11-14.
- **Endpoint pattern:**
  `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR&community=AG&longitude=<lon>&latitude=<lat>&format=JSON&start=19910101&end=20201231`

## Locations and spatial resolution

| Field | Latitude | Longitude | Notes |
|---|---:|---:|---|
| North Terrace Field - San Mateo, Isabela | 16.8731 | 121.5846 | Shares a MERRA-2 grid cell with the other Isabela field |
| Riverside Plot - Ilagan, Isabela | 17.1296 | 121.8831 | Shares a MERRA-2 grid cell with North Terrace |
| Upland Block C - Malaybalay, Bukidnon | 8.1250 | 125.0850 | Separate grid cell, about 890 m elevation |

MERRA-2 native resolution is **0.5° latitude × 0.625° longitude**, roughly 55 km × 67 km at these latitudes. The two Isabela fields are about 40 km apart and fall in the same native cell, so their POWER values are identical. That is a dataset limitation, not a data-entry error. These are grid-cell values, not field measurements.

## How variables were computed

- **Annual precipitation:** sum of daily `PRECTOTCORR` (mm/day) within each calendar year.
- **Annual mean temperature:** mean of daily `T2M`.
- **Annual mean Tmax:** mean of daily `T2M_MAX`.
- **Warm season:** March-May, the hottest part of the year in the Philippines.
- **Warm-season mean Tmax:** mean daily maximum over March-May.
- **Warm-season Tmax p95:** 95th percentile of March-May daily maximum temperatures.
- **Hot days:** count of days with `T2M_MAX` at or above 35 °C or 37 °C.
- **Longest dry spell:** longest run of consecutive days with precipitation below 1 mm/day.
- **Max 5-day precipitation:** largest sum of five consecutive daily precipitation values in the year.
- **Intense-rain days:** count of days with precipitation at or above 50 mm or 100 mm.

## Scenario definitions

All five scenarios are **historical**. No projected or hypothetical changes are presented as local projections.

| Scenario | Definition | value_type |
|---|---|---|
| Baseline | 1991-2020 long-term means and percentiles | historical |
| Drought | Year closest to the 10th-percentile annual precipitation | historical |
| Extreme heat | Year with the highest March-May mean Tmax | historical |
| Excessive rainfall | Year closest to the 90th-percentile annual precipitation | historical |
| Combined stress | Hottest year among years with annual precipitation at or below the median | historical |

Selected analog years:

| Field | Drought year | Heat year | Wet year | Combined year |
|---|---:|---:|---:|---:|
| North Terrace (San Mateo) | 1991 | 2010 | 1999 | 2010 |
| Riverside (Ilagan) | 1991 | 2010 | 1999 | 2010 |
| Upland Block C (Bukidnon) | 1992 | 1992 | 2020 | 1992 |

For Bukidnon, 1992 is both the driest-decile year and the hottest warm season in the record, so the drought, heat, and combined rows overlap. This is a real feature of the record, not a construction error.

## Important limitations

1. **Reanalysis, not a gauge.** MERRA-2 is a model reanalysis. Annual totals can differ from local rain-gauge records, especially in complex terrain. Values should be checked against PAGASA stations or GPM IMERG before operational use.
2. **Coarse resolution.** A single grid cell cannot represent field-scale variation, particularly between valley floors and uplands.
3. **Single-year analogs.** A single analog year includes that year's internal variability. It is a screening condition, not a return-period estimate.
4. **No projected scenarios yet.** The research specification lists NEX-GDDP-CMIP6 as a potential source. NEX-GDDP-CMIP6 files are large, per-model, per-variable NetCDF assets served through AWS Open Data; they were not downloaded for this handoff. When added, they should use a stated model ensemble, scenario (for example SSP2-4.5 and SSP5-8.5), and future window (for example 2041-2060), and must be labeled `projected`.
5. **No IMERG rows yet.** GPM IMERG is the recommended source for observed intense rainfall and sub-daily extremes. GES DISC access requires an Earthdata login, so it was not used here. The POWER 5-day and 50 mm/day indicators are a coarser substitute.
6. **Warm-season definition is fixed.** March-May is appropriate for the Philippine dry-season heat peak but should be configurable for other regions.

## How the Rotation Lab should use these scenarios

- Treat the baseline as the comparison condition.
- Treat drought, heat, excessive rainfall, and combined rows as **historical stress analogs**, not forecasts.
- Use the scenario values to drive the water balance and the climate-suitability indicators in `rotation_evaluation_framework.json`.
- Display the analog year and the grid resolution next to every scenario result.
- When projected data are added, keep `value_type = projected` and never mix projected and historical values in one unlabeled comparison.

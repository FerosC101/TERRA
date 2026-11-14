# Local Soil Research Notes — TERRA Demonstration Sites

**Date:** 2026-11-14
**Scope:** North Terrace Field (San Mateo, Isabela) · Riverside Plot (Ilagan, Isabela) · Upland Block C (Malaybalay, Bukidnon)
**Companion data file:** `soil_reference.csv`

## 1. Purpose

This note summarizes the regional soil context for TERRA's demonstration fields and records what is — and is not — known about their soils. It follows Section 3 of the TERRA agricultural research specification, which requires regional soil-map information to be kept separate from demonstration-field measurements, laboratory results, and model estimates.

## 2. Regional setting

- **Cagayan Valley (Isabela):** The demonstration fields sit in the Cagayan River basin, dominated by lowland plains used for corn and rice production. Soils are largely alluvial in origin; drainage and seasonal flooding vary across the plain. Isabela has 16 documented soil series, including Bago, Bantog, Bigaa, Cauayan, Faraon, Guimbalaon, Ilagan, Quingua, Rugao, San Manuel, San Juan, Sibul, Sta. Rita, Annam, Alaminos, and Tagulod.
- **Bukidnon (Malaybalay):** The upland site lies in the northern Mindanao highlands, where corn is also a key commodity. Soils are largely developed on volcanic and upland parent materials and tend to be more strongly acid than the Isabela lowlands.

## 3. What the official soil pH maps show

Both provinces have Bureau of Soils and Water Management (BSWM) soil pH maps covering their key corn areas. The maps summarize pH classes over mapped area, not individual parcels.

### Isabela — key corn areas (total mapped 56,467 ha)

| pH class | Description | Area (ha) | Share |
|---|---|---:|---:|
| ≤4.5 or ≥6.9 | Extremely acid / nearly neutral to alkaline (combined legend row) | 20,091 | 35.58% |
| 4.6–5.0 | Very strongly acid | 7,711 | 13.65% |
| 5.1–5.5 | Strongly acid | 8,146 | 14.43% |
| 5.6–6.8 | Moderately acid to slightly acid | 20,519 | 36.34% |

### Bukidnon — key corn areas (total mapped 32,405 ha)

| pH class | Description | Area (ha) | Share |
|---|---|---:|---:|
| ≤4.5 or ≥6.9 | Extremely acid / nearly neutral to alkaline (combined legend row) | 6,788 | 20.95% |
| 4.6–5.0 | Very strongly acid | 7,005 | 21.62% |
| 5.1–5.5 | Strongly acid | 8,604 | 26.55% |
| 5.6–6.8 | Moderately acid to slightly acid | 10,008 | 30.88% |

**Reading this honestly:**

- Isabela's mapped corn areas are dominated by moderately-to-slightly acid soils (5.6–6.8), with roughly one third of the area in the combined extreme classes.
- Bukidnon is distinctly more acidic: over 48% of the mapped corn area falls below pH 5.5 (very strongly acid plus the extremely acid portion of the combined class), which is consistent with its upland, heavily weathered soils.
- Caveat: the published legend merges pH ≤4.5 and pH ≥6.9 into a single row, so those two ends cannot be separated from each other without the underlying polygon data. These figures describe the province's key corn areas, not the TERRA parcels specifically.

## 4. Representative Isabela soil series

The PhilRice *Simplified Keys to Soil Series — Isabela* documents series properties relevant to crop growth. Four rolling-upland series are included as examples in `soil_reference.csv`; they are **province-level identifications, not parcel assignments** for the TERRA fields.

| Series | Texture | pH | Organic matter | Drainage | Effective depth | Fertility notes |
|---|---|---|---|---|---|---|
| Ilagan (Ign) | Clay | 5.0–6.0 | Medium | Good | Moderately deep | N moderate; P low; K medium |
| Guimbalaon (Gbn) | Silty clay | 5.5–6.0 | Medium | Good | Shallow | N moderately high; P medium; K low |
| Sibul (Sbl) | Heavy clay | 5.5–6.0 | Medium | Good | Shallow | N medium; P low; K low |
| Faraon (Frn) | Clay | Slightly acid to neutral | High | Good | Deep to very deep | N high; P medium; K medium |

No equivalent parcel-level series identification was found for the Bukidnon site from the sources reviewed.

## 5. General texture reference (not location-specific)

From the TERRA research specification, retained for orientation only:

| Texture | Water retention | Drainage | Potential considerations |
|---|---|---|---|
| Clay loam | Relatively high | Moderate to slow | Waterlogging and compaction |
| Sandy loam | Moderate | Relatively fast | Moisture management |
| Sandy | Relatively low | Fast | Irrigation and nutrient leaching |

## 6. Demonstration-field status

| Field | Location | Samples taken? | Lab tests? | Current status |
|---|---|---|---|---|
| North Terrace Field | San Mateo, Isabela | No | No | `field_measurement_pending` |
| Riverside Plot | Ilagan, Isabela | No | No | `field_measurement_pending` |
| Upland Block C | Malaybalay, Bukidnon | No | No | `field_measurement_pending` |

Until samples are collected and analyzed, the regional pH and series information above must **not** be presented as field measurements for these parcels. Any interim use of typical values should be labeled as model estimates, not observations.

## 7. Gaps and recommended next steps

1. **Field sampling:** collect composite topsoil (0–30 cm) and subsoil samples per demonstration field, following a standard soil-sampling protocol.
2. **Laboratory analysis:** pH, organic matter, available N/P/K, cation exchange capacity, texture fraction, bulk density, and drainage/infiltration where feasible.
3. **Parcel-level classification:** request DA-RFO or BSWM soil survey mapping to attribute the exact soil series at each field, rather than relying on provincial examples.
4. **Water-holding capacity:** derive from measured texture (and bulk density) via pedotransfer functions once lab results exist; record method and uncertainty.
5. **Update `soil_reference.csv`** with `field_measurement` and `lab_test` rows when results arrive, keeping them distinct from the regional-map rows.

## Sources

- Bureau of Soils and Water Management (BSWM), Department of Agriculture. *Soil pH Map — Province of Isabela (Key Corn Areas)*, 2018. https://www.bswm.da.gov.ph/wp-content/uploads/isabela-ph-corn.pdf
- Bureau of Soils and Water Management (BSWM), Department of Agriculture. *Soil pH Map — Province of Bukidnon (Key Corn Areas)*. https://www.bswm.da.gov.ph/wp-content/uploads/Bukidnon_pH-corn.pdf
- Philippine Rice Research Institute (PhilRice). *Simplified Keys to Soil Series — Isabela.* https://www.philrice.gov.ph/wp-content/uploads/2015/08/Simplified-Keys-to-Soil-Series-Isabela.pdf
- TERRA Agricultural Research and Model-Ready Data Responsibilities, Section 3 (Local Soil Conditions).

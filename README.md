# TERRA

A web app that helps farmers and researchers understand a field: what is changing, what to
investigate, and which crop rotations to compare. It follows one workflow:
**Observe → Discover → Investigate → Understand → Experiment → Adapt.**

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
```

Open a specific field with `/?field=lipa-cropland`, `riverside` or `upland-c`.

## The demonstration field

**Lipa Cropland** (Lipa City, Batangas, 133.7 ha) is the primary field. It is the same ground in
every part of the project:

- its boundary is the `Lipa_Cropland_AOI` polygon used by the NASA data pipeline (`docs/Data Pipeline`);
- its id maps to the pipeline's `lipa_cropland_001`;
- the hardware station `TS-01` (`hardware/`) is configured for a point inside that boundary.

Two secondary demo fields (Riverside Plot, Upland Block C) keep their own coordinates, stations and
generated records. No observation is ever shared between fields.

## What is real and what is not

No field station and no live NASA service is connected. What each part is:

| Data | Status |
|---|---|
| Lipa monthly climate (rain, ET0, max temperature) | **Real.** NASA POWER climatology 2001–2025, retrieved 14 Nov 2026. ET0 computed with FAO-56 Penman-Monteith. Drives the Rotation Lab and Future Earth for Lipa. |
| Lipa NASA record, 1–15 Jan 2024 (`data/nasa/`) | **Real.** POWER, GPM IMERG and SMAP values exported from the pipeline's `terra_daily_merged.json`. Shown on its own in Living Field Model → Climate. Days without a SMAP overpass stay empty. |
| Daily station and satellite time series | **Demo.** Generated deterministically in `lib/demo/series.ts`. The satellite series copy the sampling pattern and scale of the real products. |
| Probe points, MODIS pixels, SMAP cell on the map | **Demo.** Generated in `lib/demo/spatial.ts`. |
| Climate of the two secondary fields | **Illustrative.** Written for the demo. |
| Satellite base map | Real Esri World Imagery, labelled as an archive mosaic, not a current observation. |
| Rotation and scenario results | Real calculations (`lib/science/waterBalance.ts`): `ETc = Kc × ET0` and a ten-day soil-water balance. Crop parameters are indicative FAO-56 style values. |
| Discoveries | Four fixed-threshold rules in `lib/science/detect.ts`. Their confidence is shown as three plain levels, not a percentage. |

Every value in the UI states its source: field measurement, satellite estimate, model output or simulation.

### Record audit

Every observation series passes `lib/data/quality.ts` before a page sees it, whether it came from the
demo generator or a backend: rows are sorted, duplicate dates removed, physically impossible station
values reject the day (it becomes a gap, never a zero), impossible satellite values become unavailable,
and extreme but valid events (rain ≥ 100 mm, air ≥ 40 °C) are kept and flagged. Nothing is interpolated.
The Reports page prints the result. Dates are local calendar days at the field (`Field.timezone`).

## Design system

Light-first. Tokens live in `app/globals.css` (canvas `#F7F8F4`, surface white, ink `#183B2A`,
accent green `#37864A`). Inter is the only typeface. Shared components are in `components/ui`:
`PageHeader`, `Section`, `Card`, `Metric`, `Fact`, `SourceTag`, `Badge`, `Segmented`, `Disclosure`,
`Notice`, `EmptyState`, `ErrorState`, table classes. Charts use one component, `SeriesChart`: one axis
and one unit per chart, with a palette checked for colour-vision separation on white
(green = field measurement, blue = satellite, violet = model output).

## Structure

| Path | Contents |
|---|---|
| `app/` | Routes, layout, and `app/api/*` route handlers |
| `components/` | Brand, navigation shell, UI primitives, chart and map components |
| `features/` | One folder per page: overview, field-explorer, discovery, living-field-model, rotation-lab, future-earth, reports |
| `services/` | NASA data, field sensor, discovery, rotation, climate scenario and report services |
| `lib/science/` | Water balance, anomaly detectors, statistics |
| `lib/demo/` | Demo time-series and map-sample generators |
| `lib/data/` | Record audit (duplicates, invalid values, extremes, gaps) |
| `data/` | Fields, crop parameters, scenarios, data-source catalogue, example rotations, bundled NASA snapshot |
| `types/` | Shared domain types (the API contract) |

## Connecting a backend

UI code only calls functions in `services/`. Each one goes through `services/apiClient.ts`:
set `NEXT_PUBLIC_API_BASE_URL` (for example `http://localhost:8000`) and every call is sent to that
server instead of the mock layer. The expected endpoints, also served locally from mock data:

```
GET  /api/fields
GET  /api/fields/{id}/observations
GET  /api/fields/{id}/discoveries
GET  /api/fields/{id}/model
GET  /api/fields/{id}/sources
GET  /api/fields/{id}/nasa-snapshot
POST /api/rotations/evaluate
POST /api/scenarios/simulate
GET  /api/reports/{id}
```

Response shapes are the interfaces in `types/index.ts`. Two service calls have no local route yet
(`/api/scenarios`, `/api/fields/{id}/anomalies`); a backend needs to provide them.

The NASA pipeline's FastAPI service does not serve this contract yet. Its `/observations/daily-merged`
output is what `data/nasa/lipa-cropland-2024-01.json` was exported from.

## Notes

- UI primitives in `components/ui` are hand-written in the shadcn style; the shadcn CLI was not used.
- Rotation plans, priorities, the selected field and logged follow-up measurements persist in `localStorage`.
- PDF export uses the browser's print dialog ("Save as PDF"); the report has a light print stylesheet.

# TERRA

**DISCOVER. PREDICT. REGENERATE.**

An agricultural discovery and crop-rotation intelligence web app. TERRA follows one workflow:
**Observe → Discover → Investigate → Understand → Experiment → Adapt.**

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
```

Open a specific field with `/?field=north-terrace`, `riverside` or `upland-c`.

## What is real and what is not

This build runs entirely on **demo data**. No NASA service and no field station is connected.

- Observation series are generated deterministically in `lib/demo/series.ts` from an illustrative monthly climatology and a simple soil model. The "satellite" series copy the sampling pattern and scale of the real products (SMAP ~9 km every 2–3 days, MODIS 250 m every 16 days, and so on) so the interface is built around their real limits.
- The satellite base map in Field Explorer is real Esri World Imagery, labelled in the UI as an archive mosaic, not a current observation.
- Rotation and scenario results are real calculations (`lib/science/waterBalance.ts`): `ETc = Kc × ET0` and a ten-day soil-water bucket `S(t) = S(t−1) + P − ETa − R − D`. Crop parameters in `data/crops.ts` are indicative FAO-56 style values and need local calibration.
- Discoveries are produced by four fixed-threshold detector rules in `lib/science/detect.ts`.

Every value in the UI carries a tag: field measurement, satellite estimate, model output or simulation.

## Structure

| Path | Contents |
|---|---|
| `app/` | Routes, layout, and `app/api/*` route handlers |
| `components/` | Brand, navigation shell, UI primitives, chart and map components |
| `features/` | One folder per page: overview, field-explorer, discovery, living-field-model, rotation-lab, future-earth, reports |
| `services/` | NASA data, field sensor, discovery, rotation, climate scenario and report services |
| `lib/science/` | Water balance, anomaly detectors, statistics |
| `lib/demo/` | Demo data generator |
| `data/` | Fields, crop parameters, scenarios, data-source catalogue, example rotations |
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
POST /api/rotations/evaluate
POST /api/scenarios/simulate
GET  /api/reports/{id}
```

Response shapes are the interfaces in `types/index.ts`. Three service calls have no local route yet
(`/api/sources`, `/api/scenarios`, `/api/fields/{id}/anomalies`); a backend needs to provide them.

## Notes

- UI primitives in `components/ui` are hand-written in the shadcn style; the shadcn CLI was not used.
- Rotation plans, priorities, the selected field and logged follow-up measurements persist in `localStorage`.
- PDF export uses the browser's print dialog ("Save as PDF"); the report has a light print stylesheet.

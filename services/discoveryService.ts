import { generateAnomalies, generateSeries } from "@/lib/demo/series";
import { seriesToFieldDays } from "@/lib/adapters/demoSeries";
import { DEMO_TODAY } from "@/lib/dates";
import { toDiscovery } from "@/lib/science/discovery/cards";
import { runDiscovery } from "@/lib/science/discovery/engine";
import { pearson } from "@/lib/science/stats";
import { CROPS } from "@/data/crops";
import { REAL_FIELD_SETTINGS } from "@/data/lipaModelConfig";
import { realRecord } from "@/data/nasa/realRecords";
import { fmt } from "@/lib/format";
import type { DailyObservation, Discovery, Field, FieldModel, FollowUp, Relationship } from "@/types";
import { request } from "./apiClient";
import { livingFieldModel } from "./fieldModelService";
import { mockField } from "./fieldSensorService";

/**
 * Runs the Discovery Engine on a field's record and words the latest alarm of each detector as a
 * card, newest first. Earlier onsets are not shown: on demo records the moisture rule fires every
 * ~15 days (F-002), which would flood the page.
 * A field with a real record (data/nasa/realRecords.ts, e.g. Lipa Cropland) runs on that record with its
 * calibrated settings (data/lipaModelConfig.ts) instead of the demo series.
 */
export function discoveriesFor(field: Field, obs: DailyObservation[], followUps: FollowUp[] = []): Discovery[] {
  const real = realRecord(field.id);
  const days = real ?? seriesToFieldDays(obs, field);
  const records = runDiscovery(days, {
    fieldId: field.id,
    location: real ? field.center : field.station.position,
    monthlyRainMm: field.climate.rainMm,
    crop: CROPS[field.currentCrop],
    plantedOn: field.plantedOn,
    runAt: `${DEMO_TODAY}T00:00:00Z`,
    ...(real ? REAL_FIELD_SETTINGS[field.id] : {}),
  });
  const latest = new Map(records.map((r) => [r.detector, r]));
  return [...latest.values()]
    .sort((a, b) => b.window.end.localeCompare(a.window.end))
    .map((r) => toDiscovery(r, days, field, followUps));
}

/** GET /api/fields/{id}/discoveries */
export function getDiscoveries(fieldId: string, followUps: FollowUp[] = []): Promise<Discovery[]> {
  return request(`/api/fields/${fieldId}/discoveries`, () => {
    const field = mockField(fieldId);
    return discoveriesFor(field, generateSeries(field), followUps);
  });
}

export function mockFieldModel(fieldId: string): FieldModel {
  const field = mockField(fieldId);
  const obs = generateSeries(field);
  const latest = obs[obs.length - 1];

  // Relationships found in this record. Correlation in a short record is a prompt
  // for investigation, never proof of cause.
  const rain3: number[] = [];
  const dSurf: number[] = [];
  for (let i = 3; i < obs.length; i++) {
    rain3.push(obs[i].rainMm + obs[i - 1].rainMm + obs[i - 2].rainMm);
    dSurf.push(obs[i].surfaceVwc - obs[i - 3].surfaceVwc);
  }
  const ndviRows = obs.map((o, i) => ({ o, i })).filter((r) => r.o.ndvi !== null && r.i >= 16);
  const ndviVals = ndviRows.map((r) => r.o.ndvi as number);
  const moistBefore = ndviRows.map((r) => obs.slice(r.i - 16, r.i).reduce((a, o) => a + o.deepVwc, 0) / 16);

  const relationships: Relationship[] = [
    { from: "climate", to: "water", label: "Rainfall → surface moisture", r: pearson(rain3, dSurf), n: rain3.length,
      note: "3-day rainfall against the 3-day change in 10 cm moisture." },
    { from: "climate", to: "soil", label: "Air temperature → soil temperature", r: pearson(obs.map((o) => o.tmaxC), obs.map((o) => o.soilTempC)), n: obs.length,
      note: "Daily maximum air temperature against soil temperature at 10 cm." },
    { from: "water", to: "soil", label: "Soil moisture → bulk EC", r: pearson(obs.map((o) => o.surfaceVwc), obs.map((o) => o.ecDsM)), n: obs.length,
      note: "Bulk EC rises when soil is wetter. This is why EC alone cannot be read as salinity or fertility." },
    { from: "water", to: "vegetation", label: "Deeper moisture → vegetation index", r: pearson(moistBefore, ndviVals), n: ndviVals.length,
      note: "Mean 40 cm moisture over the 16 days before each NDVI composite. Few points — treat as weak evidence." },
    { from: "rotation", to: "vegetation", label: "Crop calendar → vegetation index", r: pearson(obs.filter((o) => o.ndvi !== null).map((o) => o.etcMm / Math.max(o.et0Mm, 0.1)), obs.filter((o) => o.ndvi !== null).map((o) => o.ndvi as number)), n: ndviVals.length + 1,
      note: "Crop coefficient for the planted crop against NDVI: the canopy follows the crop calendar." },
  ];

  const lastNdvi = [...obs].reverse().find((o) => o.ndvi !== null);
  const rain30 = obs.slice(-30).reduce((a, o) => a + o.rainMm, 0);
  const now = livingFieldModel(field, obs).at(-1)!.water;
  const families = new Set(field.rotationHistory.map((r) => CROPS[r.crop].family));

  return {
    fieldId,
    asOf: latest.date,
    observations: obs,
    anomalies: generateAnomalies(field),
    relationships,
    summaries: {
      water: `Surface moisture is ${fmt(latest.surfaceVwc, 1)}% and moisture at 40 cm is ${fmt(latest.deepVwc, 1)}%. The field model estimates ${fmt(now.tawMm - now.depletionMm, 0)} mm of plant-available water in the root zone, of a possible ${fmt(now.tawMm, 0)} mm.`,
      soil: `${field.soil.texture}. Soil temperature at 10 cm is ${fmt(latest.soilTempC, 1)} °C and bulk EC is ${fmt(latest.ecDsM, 2)} dS/m. These describe current physical conditions at one point, not soil fertility.`,
      vegetation: lastNdvi ? `The latest 16-day NDVI composite is ${fmt(lastNdvi.ndvi, 2)}, for the period ending ${lastNdvi.date}. ${CROPS[field.currentCrop].name} is the current crop.` : "No vegetation composite is available yet.",
      climate: `${fmt(rain30, 0)} mm of rain fell in the last 30 days. Today's maximum air temperature was ${fmt(latest.tmaxC, 1)} °C.`,
      rotation: `${field.rotationHistory.length} seasons on record across ${families.size} crop ${families.size === 1 ? "family" : "families"}. Current crop: ${CROPS[field.currentCrop].name}.`,
    },
  };
}

/** GET /api/fields/{id}/model */
export function getFieldModel(fieldId: string): Promise<FieldModel> {
  return request(`/api/fields/${fieldId}/model`, () => mockFieldModel(fieldId));
}
